/* eslint-disable no-constant-condition */
/* eslint-disable @typescript-eslint/naming-convention */
import * as path from 'path'
import worker_threads from 'worker_threads'
import * as vv from 'vv-common'
import * as metronom from 'vv-metronom'

import { TWorkerDataApp, TMessageImportApp, TMessageExportApp} from './worker/app.worker'
import { TWorkerDataFs, TMessageImportFs, TMessageExportFs  } from './worker/fs.worker'
import { TWorkerDataSql, TMessageImportSql, TMessageExportSql } from './worker/mssql.worker'

import { TSetting } from './core/setting'
import { TWEfileLoad } from './exchange'
import { Timer } from './core/timer'
import { Hold, THoldState } from './core/hold'

export type TWorkerMssql = {
    w: worker_threads.Worker,
    idx: TMssqlWorkerIdx,
    countQueue: number,
    countSuccessDigest: number,
    countSuccessTrace: number,
    countErrorDigest: number,
    countErrorTrace: number
}

export type THold = {
    manual: boolean,
    stopPrepare: boolean,
    stopDone: boolean,
    stopTime: string,
    pausePrepare: boolean,
    pauseDone: boolean,
    pauseTimeStart: string,
    pauseTimeStop: string,
}

const MSSQLWORKER_COUNT = 8
export type TMssqlWorkerIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
export type TMssqlWorkerIdxDestination = TMssqlWorkerIdx | 'all' | 'best'

export const env = {
    setting: undefined as TSetting,
    wApp: undefined as worker_threads.Worker,
    wFs: undefined as worker_threads.Worker,
    wMssql: [] as TWorkerMssql [],
    filesForLoad: [] as TWEfileLoad[],
    hold: new Hold(),
    state: 'holdManual' as THoldState,
    taskStatDigest: undefined as metronom.Metronom,
    taskStatTrace: undefined as metronom.Metronom,
}

export async function Go(currentPath: string) {
    startAppWorker(currentPath)
    startMssqlWorker(currentPath)
    startFsWorker(currentPath)
}

function startAppWorker(currentPath: string) {
    env.wApp = new worker_threads.Worker(path.join(__dirname, 'worker', 'app.worker.js'), {
        workerData: {currentPath: currentPath} as TWorkerDataApp
    })
    sendToWorkerApp({kind: 'log.debug', subsystem: 'app', text: 'app started'})
    env.wApp.on('message', (message: TMessageExportApp) => {
        const unknownMessage = message.kind as string
        if (message.kind === 'setting') {
            env.setting = message.setting
            sendToWorkerMssql('all', {kind: 'setting', setting: env.setting})
            sendToWorkerFs({kind: 'setting', setting: env.setting})

            const messageHold = env.hold.setSetting(env.setting)
            messageHold.error.forEach(item => {
                sendToWorkerApp({kind: 'log.error', subsystem: 'app', text: item})
            })
            messageHold.debug.forEach(item => {
                sendToWorkerApp({kind: 'log.debug', subsystem: 'app', text: item})
            })
            messageHold.trace.forEach(item => {
                sendToWorkerApp({kind: 'log.trace', subsystem: 'app', text: item})
            })
        } else if (message.kind === 'log.load.digest' || message.kind === 'log.load.error') {
            sendToWorkerMssql('best', message)
        } else {
            sendToWorkerApp({kind: 'log.error', subsystem: 'app', text: `internal error - from worker.app unknown message kind "${unknownMessage}"`})
        }
    })

    env.hold.eventOnHold((state) => {
        if (state === 'stopPrepare') {
            sendToWorkerApp({kind: 'log.debug', subsystem: 'app', text: `service will be stopped after 5 minutes, prepare to stop`})
        }
        env.state = state
        sendToWorkerApp({kind: 'hold', state})
        sendToWorkerFs({kind: 'hold', state})
        sendToWorkerMssql('all', {kind: 'hold', state})
        if (state === 'stop') {
            sendToWorkerApp({kind: 'log.debug', subsystem: 'app', text: `service will be stopped after 10 seconds`})
            setTimeout(() => {
                process.exit()
            }, 1000 * 10)
        }
    })

    env.taskStatTrace = metronom.Create({kind: 'cron', cron: '0 */1 * * * *'})
    env.taskStatTrace.onTick(() => {
        const q = env.filesForLoad.length
        env.wMssql.forEach((item, itemIdx) => {
            const cs = item.countSuccessTrace
            const ce = item.countErrorTrace
            item.countSuccessTrace = 0
            item.countErrorTrace = 0
            sendToWorkerApp({kind: 'log.debug', subsystem: 'sql', text: `digest for worker #${itemIdx}: success load ${cs} file(s), error load ${ce} file(s), queue in worker ${item.countQueue}, queue in buffer ${q}`})
        })
        env.taskStatTrace.allowNextTick()
    })
    env.taskStatTrace.start()

    env.taskStatDigest = metronom.Create({kind: 'cron', cron: '0 */10 * * * *'})
    env.taskStatDigest.onTick(() => {
        if (env.state === '') {
            let countSuccess = 0
            let countError = 0
            let countQueue = 0
            env.wMssql.forEach(item => {
                countSuccess = countSuccess + item.countSuccessDigest
                countError = countError + item.countErrorDigest
                countQueue = countQueue + item.countQueue
                item.countSuccessDigest = 0
                item.countErrorDigest = 0
            })
            countQueue = countQueue + env.filesForLoad.length
            sendToWorkerApp({kind: 'log.digest', countSuccess, countError, countQueue})
        }
        env.taskStatDigest.allowNextTick()
    })
    env.taskStatDigest.start()
}

function startMssqlWorker(currentPath: string) {
    for (let i = 0; i < MSSQLWORKER_COUNT; i++) {

        const idx = i as TMssqlWorkerIdx

        const wm = {
            w: new worker_threads.Worker(path.join(__dirname, 'worker', 'mssql.worker.js'), {
                workerData: {currentPath: currentPath, idx: idx} as TWorkerDataSql
            }),
            idx: idx,
            countQueue: 0,
            countSuccessDigest: 0,
            countSuccessTrace: 0,
            countErrorDigest: 0,
            countErrorTrace: 0
        } as TWorkerMssql

        wm.w.on('message', (message: TMessageExportSql) => {
            const unknownMessage = message.kind as string
            if (message.kind === 'log.trace' || message.kind === 'log.debug' || message.kind === 'log.error') {
                sendToWorkerApp(message)
            } else if (message.kind === 'file.create') {
                sendToWorkerFs(message)
            } else if (message.kind === 'file.forget' || message.kind === 'file.move') {
                sendToWorkerFs(message)
            } else if (message.kind === 'file.result') {
                wm.countQueue--
                if (message.result === 'success') {
                    wm.countSuccessDigest++
                    wm.countSuccessTrace++
                } else {
                    wm.countErrorDigest++
                    wm.countErrorTrace++
                }
            } else {
                sendToWorkerApp({kind: 'log.error', subsystem: 'app', text: `internal error - from worker.mssql unknown message kind "${unknownMessage}"`})
            }
        })
        env.wMssql.push(wm)
    }
}

function startFsWorker(currentPath: string) {
    env.wFs = new worker_threads.Worker(path.join(__dirname, 'worker', 'fs.worker.js'), {
        workerData: {currentPath: currentPath} as TWorkerDataFs
    })

    env.wFs.on('message', (message: TMessageExportFs) => {
        const unknownMessage = message.kind as string
        if (message.kind === 'log.trace' || message.kind === 'log.debug' || message.kind === 'log.error') {
            sendToWorkerApp(message)
        } else if (message.kind === 'file.load') {
            env.filesForLoad.push(message)
        } else {
            sendToWorkerApp({kind: 'log.error', subsystem: 'app', text: `internal error - from worker.fs unknown message kind "${unknownMessage}"`})
        }
    })
}

const timerFileQueue = new Timer(2000, () => {
    if (env.wMssql.length < MSSQLWORKER_COUNT || vv.isEmpty(env.setting)) {
        timerFileQueue.nextTick(200)
        return
    }

    let totalContFilesInWorkers = 0
    env.wMssql.forEach(item => totalContFilesInWorkers = totalContFilesInWorkers + item.countQueue)

    while (env.filesForLoad.length > 0 && env.setting.mssql.maxStreams > totalContFilesInWorkers && env.state === '') {
        const worker = findWorkerMssql()
        if (vv.isEmpty(worker)) {
            break
        }

        const message = env.filesForLoad.shift()
        if (vv.isEmpty(message)) {
            break
        }

        sendToWorkerMssql(worker.idx, message)
        worker.countQueue++
        totalContFilesInWorkers = 0
        env.wMssql.forEach(item => totalContFilesInWorkers = totalContFilesInWorkers + item.countQueue)
    }

    if (env.state !== '') {
        while (true) {
            const message = env.filesForLoad.shift()
            if (vv.isEmpty(message)) {
                break
            }
            sendToWorkerFs({kind: 'file.forget', path: message.stamp.path, file: message.stamp.file})
        }
    }

    timerFileQueue.nextTick(100)
})

function sendToWorkerApp(message: TMessageImportApp) {
    if (env.wApp) {
        env.wApp.postMessage(message)
    } else {
        const timer = new Timer(500, () => {
            sendToWorkerApp(message)
            timer.destroy()
        })
    }
}

function sendToWorkerFs(message: TMessageImportFs) {
    if (env.wFs) {
        env.wFs.postMessage(message)
    } else {
        const timer = new Timer(500, () => {
            sendToWorkerFs(message)
            timer.destroy()
        })
    }
}

function sendToWorkerMssql(idx: TMssqlWorkerIdxDestination, message: TMessageImportSql) {
    if (env.wMssql.length >= MSSQLWORKER_COUNT) {
        if (idx === 'all') {
            env.wMssql.forEach(item => {
                item.w.postMessage(message)
            })
        } else if (idx === 'best') {
            const worker = findWorkerMssql()
            if (!vv.isEmpty(worker)) {
                worker.w.postMessage(message)
            }
        } else {
            const worker = env.wMssql.find(f => f.idx === idx)
            if (!vv.isEmpty(worker)) {
                worker.w.postMessage(message)
            }
        }
    } else {
        const timer = new Timer(500, () => {
            sendToWorkerMssql(idx, message)
            timer.destroy()
        })
    }
}

function findWorkerMssql(): TWorkerMssql {
    let findCountQueue = undefined as number
    let findItem = undefined as TWorkerMssql

    for (let i = 0; i < MSSQLWORKER_COUNT; i++) {
        const item = env.wMssql.at(i)
        if (vv.isEmpty(item)) break

        if (item.countQueue === 0) return item

        if (findCountQueue === undefined || findCountQueue > item.countQueue) {
            findCountQueue = item.countQueue
            findItem = item
        }
    }

    return findItem
}

//TODO check not exists queries or paths
//TODO check all setting params in workers
