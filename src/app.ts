import * as path from 'path'
import worker_threads from 'worker_threads'
import { TWorkerDataApp, TMessageImportApp, TMessageExportApp} from './worker/app.worker'
import { TWorkerDataFs, TMessageImportFs, TMessageExportFs  } from './worker/fs.worker'
import { TWorkerDataSql, TMessageImportSql, TMessageExportSql } from './worker/mssql.worker'

import { TSetting } from './core/setting'
import { TWEfileLoad } from './exchange'
import { Timer } from './core/timer'

type TWorkerMssql = {w: worker_threads.Worker, cntFiles: number}

const env = {
    setting: undefined as TSetting,
    wApp: undefined as worker_threads.Worker,
    wFs: undefined as worker_threads.Worker,
    wMssql: [] as TWorkerMssql [],
    filesForLoad: [] as TWEfileLoad[]
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
        } else if (message.kind === 'log.error') {
            //TODO send to mssql
        } else {
            sendToWorkerApp({kind: 'log.error', subsystem: 'app', text: `internal error - from worker.app unknown message kind "${unknownMessage}"`})
        }
    })
}

function doMssqlWorker(currentPath: string) {
    for (let i = 0; i < 8; i++) {
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
            } else if (message.kind === 'file.create' || message.kind === 'file.forget' || message.kind === 'file.move') {
                sendToWorkerFs(message)
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

const timerFiles = new Timer(2000, () => {

    let totalContFilesInWorkers = 0
    env.wMssql.forEach(item => totalContFilesInWorkers = totalContFilesInWorkers + item.cntFiles)

    while (env.filesForLoad.length > 0 && env.setting.mssql.maxStreams > totalContFilesInWorkers) {
        const bestWorker = {
            cntFiles: 0,
            idx: 0
        }
        env.wMssql.forEach((item, itemIdx) => {
            totalContFilesInWorkers = totalContFilesInWorkers + item.cntFiles
            if (item.cntFiles < bestWorker.cntFiles) {
                bestWorker.cntFiles = item.cntFiles
                bestWorker.idx = itemIdx
            }
        })
        const message = env.filesForLoad.shift()
        if (message) {
            sendToWorkerMssql(bestWorker.idx, message)
        }
    }

    timerFiles.nextTick(500)
})

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
    if (env.wMssql.length > idx) {
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
