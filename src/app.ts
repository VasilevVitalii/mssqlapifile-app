/* eslint-disable @typescript-eslint/naming-convention */
import * as path from 'path'
import worker_threads from 'worker_threads'
import * as vv from 'vv-common'
import { TWorkerDataApp, TMessageImportApp, TMessageExportApp} from './worker/app.worker'
import { TWorkerDataFs, TMessageImportFs, TMessageExportFs  } from './worker/fs.worker'
import { TWorkerDataSql, TMessageImportSql, TMessageExportSql } from './worker/mssql.worker'
import * as metronom from 'vv-metronom'

import { TSetting, TSettingPause } from './core/setting'
import { TWEfileLoad } from './exchange'
import { Timer } from './core/timer'

type TWorkerMssql = {w: worker_threads.Worker, cntFiles: number}

type THold = {
    manual: boolean,
    stopPrepare: boolean,
    stopDone: boolean,
    stopTime: string,
    autoStartAfter: Date
}

const env = {
    setting: undefined as TSetting,
    wApp: undefined as worker_threads.Worker,
    wFs: undefined as worker_threads.Worker,
    wMssql: [] as TWorkerMssql [],
    filesForLoad: [] as TWEfileLoad[],
    digest: [] as {countSuccess: number, countError: number}[],
    taskDigest: undefined as metronom.Metronom,
    hold: {
        manual: false,
        stopPrepare: false,
        stopDone: false,
        stopTime: '',
        autoStartAfter: undefined
    } as THold
}

export async function Go(currentPath: string) {
    doAppWorker(currentPath)
    doMssqlWorker(currentPath)
    doFsWorker(currentPath)
}

function doAppWorker(currentPath: string) {
    env.wApp = new worker_threads.Worker(path.join(__dirname, 'worker', 'app.worker.js'), {
        workerData: {currentPath: currentPath} as TWorkerDataApp
    })
    sendToWorkerApp({kind: 'log.debug', subsystem: 'app', text: 'app started'})
    env.wApp.on('message', (message: TMessageExportApp) => {
        const unknownMessage = message.kind as string
        if (message.kind === 'setting') {
            env.setting = message.setting
            env.wMssql.forEach((item, itemIdx) => {
                sendToWorkerMssql(itemIdx, {kind: 'setting', setting: env.setting})
            })
            sendToWorkerFs({kind: 'setting', setting: env.setting})

            const cronTaskDigest = env.setting.log.logAllowTrace === true ? '0 */1 * * * *' : '0 */10 * * * *'
            if (vv.isEmpty(env.taskDigest) || env.taskDigest.cron().cron !== cronTaskDigest) {
                env.taskDigest?.stop()
                env.taskDigest = metronom.Create({kind: 'cron', cron: cronTaskDigest})
                env.taskDigest.onTick(() => {
                    onDigest()
                    env.taskDigest.allowNextTick()
                })
                env.taskDigest.start()
                sendToWorkerApp({kind: 'log.debug', subsystem: 'app', text: `digest start, cron "${cronTaskDigest}"`})
            }
        } else if (message.kind === 'log.load.digest' || message.kind === 'log.load.error') {
            sendToWorkerMssql(undefined, message)
        } else {
            sendToWorkerApp({kind: 'log.error', subsystem: 'app', text: `internal error - from worker.app unknown message kind "${unknownMessage}"`})
        }
    })
}

function doMssqlWorker(currentPath: string) {
    for (let i = 0; i < 8; i++) {
        env.digest.push({countSuccess: 0, countError: 0})

        const wm = {
            w: new worker_threads.Worker(path.join(__dirname, 'worker', 'mssql.worker.js'), {
                workerData: {currentPath: currentPath, setting: env.setting, idx: i} as TWorkerDataSql
            }),
            cntFiles: 0
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
                wm.cntFiles--
                if (message.result === 'success') {
                    env.digest[i].countSuccess++
                } else {
                    env.digest[i].countError++
                }
            } else {
                sendToWorkerApp({kind: 'log.error', subsystem: 'app', text: `internal error - from worker.mssql unknown message kind "${unknownMessage}"`})
            }
        })
        env.wMssql.push(wm)
    }
}

function doFsWorker(currentPath: string) {
    env.wFs = new worker_threads.Worker(path.join(__dirname, 'worker', 'fs.worker.js'), {
        workerData: {currentPath: currentPath, setting: env.setting} as TWorkerDataFs
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

const timer = new Timer(2000, () => {
    onFileQueue()
    onHold()
    timer.nextTick(500)
})

function onFileQueue() {
    if (env.wMssql.length <= 0) return

    let totalContFilesInWorkers = 0
    env.wMssql.forEach(item => totalContFilesInWorkers = totalContFilesInWorkers + item.cntFiles)

    while (env.filesForLoad.length > 0 && env.setting.mssql.maxStreams > totalContFilesInWorkers) {
        const message = env.filesForLoad.shift()
        if (message) {
            const idx = findWorkerMssql()
            env.wMssql[idx].cntFiles++
            sendToWorkerMssql(idx, message)
        }
    }
}

function onDigest() {
    let countSuccess = 0
    let countError = 0
    let countQueue = 0

    env.wMssql.forEach((item, itemIdx) => {
        const d = env.digest[itemIdx]

        countQueue = countQueue + item.cntFiles
        countSuccess = countSuccess + d.countSuccess
        countError = countError + d.countError

        sendToWorkerApp({kind: 'log.trace', subsystem: 'sql', text: `digest for worker #${itemIdx}: success load ${d.countSuccess} file(s), error load ${d.countError} file(s), queue ${item.cntFiles}`})

        d.countSuccess = 0
        d.countError = 0
    })

    sendToWorkerApp({kind: 'log.digest', countSuccess, countError, countQueue})
}

function onHold() {
    if (vv.isEmpty(env.setting)) return
    const hold = {...env.hold}
    const timeNow = new Date()
    const s = serviceByWeekday()

    hold.manual = env.setting.service.holdManual

    if (!vv.isEmpty(s.stop) && !hold.stopPrepare) {
        if (s.stop !== hold.stopTime) {
            const timeStop = strTimeToDate(s.stop)
            if (timeStop === undefined) {
                s.stop = ''
                hold.stopDone = false
                hold.stopPrepare = false
                hold.stopTime = ''
                sendToWorkerApp({kind: 'log.error', subsystem: 'app', text: `setting has bad param "service.stop.${s.dow}"="${s.stop}"`})
            } else if (timeStop > timeNow) {
                hold.stopDone = false
                hold.stopPrepare = false
                hold.stopTime = s.stop
            } else {
                hold.stopDone = false
                hold.stopPrepare = false
                hold.stopTime = ''
            }
        }
    }
    if (!hold.stopPrepare && !vv.isEmpty(hold.stopTime) && vv.dateAdd(timeNow, 'minute', 5) > strTimeToDate(hold.stopTime)) {
        sendToWorkerApp({kind: 'log.debug', subsystem: 'app', text: `prepare service to stop, happens in 5 minutes`})
        hold.stopPrepare = true
    } else if (hold.stopPrepare && !vv.isEmpty(hold.stopTime) && timeNow > strTimeToDate(hold.stopTime)) {
        hold.stopDone = true
    }




    if (JSON.stringify(env.hold) !== JSON.stringify(hold)) {
        env.hold = hold
    }

}

function sendToWorkerApp(message: TMessageImportApp) {
    if (env.wApp) {
        env.wApp.postMessage(message)
    } else {
        const timer = new Timer(500, () => {
            if (env.wApp) {
                env.wApp.postMessage(message)
                timer.destroy()
            } else {
                timer.nextTick(500)
            }
        })
    }
}

function sendToWorkerFs(message: TMessageImportFs) {
    if (env.wFs) {
        env.wFs.postMessage(message)
    } else {
        const timer = new Timer(500, () => {
            if (env.wFs) {
                env.wFs.postMessage(message)
                timer.destroy()
            } else {
                timer.nextTick(500)
            }
        })
    }
}

function sendToWorkerMssql(idx: number, message: TMessageImportSql) {
    if (vv.isEmpty(idx)) {
        if (env.wMssql.length > 0) {
            env.wMssql[findWorkerMssql()].w.postMessage(message)
        } else {
            const timer = new Timer(500, () => {
                if (env.wMssql.length <= 0) {
                    timer.nextTick(500)
                    return
                }
                env.wMssql[findWorkerMssql()].w.postMessage(message)
                timer.destroy()
            })
        }
    } else if (env.wMssql.length > idx) {
        env.wMssql[idx].w.postMessage(message)
    } else {
        const timer = new Timer(500, () => {
            if (env.wMssql.length > idx) {
                env.wMssql[idx].w.postMessage(message)
                timer.destroy()
            } else {
                timer.nextTick(500)
            }
        })
    }
}

function findWorkerMssql(): number {
    const bestWorker = {
        cntFiles: 0,
        idx: 0
    }
    env.wMssql.forEach((item, itemIdx) => {
        if (item.cntFiles < bestWorker.cntFiles) {
            bestWorker.cntFiles = item.cntFiles
            bestWorker.idx = itemIdx
        }
    })

    return bestWorker.idx
}

function strTimeToDate(time: string): Date {
    if (time.length !== 5) return undefined
    const hour = vv.toIntPositive(time.substring(0, 2))
    const min = vv.toIntPositive(time.substring(3, 5))
    if (hour === undefined || hour > 23) return undefined
    if (min === undefined || min > 59) return undefined

    const now = new Date()
    return vv.dateAdd(vv.dateAdd(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 'hour', hour), 'minute', min)
}

function serviceByWeekday(): {stop: string, holdAuto: TSettingPause, dow: string} {
    if (vv.isEmpty(env.setting)) {
        return {stop: "", holdAuto: {time: "", duration: 0}, dow: 'none'}
    }
    const day = (new Date()).getDay()
    return day === 0 ? {stop: env.setting.service.stop.sunday, holdAuto: env.setting.service.holdAuto.sunday, dow: 'sunday'} :
            day === 1 ? {stop: env.setting.service.stop.monday, holdAuto: env.setting.service.holdAuto.monday, dow: 'monday'} :
            day === 2 ? {stop: env.setting.service.stop.tuesday, holdAuto: env.setting.service.holdAuto.tuesday, dow: 'tuesday'} :
            day === 3 ? {stop: env.setting.service.stop.wednesday, holdAuto: env.setting.service.holdAuto.wednesday, dow: 'wednesday'} :
            day === 4 ? {stop: env.setting.service.stop.thursday, holdAuto: env.setting.service.holdAuto.thursday, dow: 'thursday'} :
            day === 5 ? {stop: env.setting.service.stop.friday, holdAuto: env.setting.service.holdAuto.friday, dow: 'friday'} :
            {stop: env.setting.service.stop.saturday, holdAuto: env.setting.service.holdAuto.saturday, dow: 'saturday'}
}


//TODO service.hold
//TODO service.pause
//TODO service.stop
//TODO trace
//TODO check not exists queries or paths
//TODO check all setting params in workers
