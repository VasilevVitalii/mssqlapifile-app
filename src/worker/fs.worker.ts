import path from 'path'
import fs, { exists } from 'fs-extra'
import * as vv from 'vv-common'
import wildcard from 'wildcard'
import { workerData, parentPort } from 'worker_threads'
import { TSetting, TSettingScan } from '../core/setting'
import { Timer } from '../core/timer'
import { TFileStat, TWEfileCreate, TWEfileForget, TWEfileLoad, TWEfileMove, TWEfileStamp, TWElogDebug, TWElogError, TWElogTrace, TWEsetting } from '../exchange'

export type TWorkerDataFs = {currentPath: string, setting: TSetting}
export type TMessageImportFs = TWEsetting | TWEfileMove | TWEfileCreate | TWEfileForget
export type TMessageExportFs = TWEfileLoad | TWElogTrace | TWElogDebug | TWElogError

type TScanFile = {
    stamp: TWEfileStamp,
    // path: string,
    // file: string,
    // mask: TScanPathMask,
    stat: TFileStat,
    countStat: number,
    timeSendToMssql?: Date
}

type TScanPathMask = {
    scan: TSettingScan,
    maskFile: string
}

type TScanPath = {
    path: string,
    mask: TScanPathMask[],
    scanAfter?: Date
}

const env = {
    workerData: workerData as TWorkerDataFs,
    setting: undefined as TSetting,
    scanPath: [] as TScanPath[],
    scanFile: [] as TScanFile[],
    fileProcess: [] as (TWEfileMove | TWEfileCreate)[]
}

parentPort.postMessage({kind: 'log.trace', subsystem: 'dir', text: `worker started`} as TMessageExportFs)

buildScanPath()

const timerScan = new Timer(2000, async () => {
    await Promise.all(env.scanPath.filter(f => !f.scanAfter || (new Date() > f.scanAfter)).map(async (item) => {
        if (item.scanAfter) item.scanAfter = undefined

        try {
            fs.ensureDir(item.path)
        } catch (error) {
            item.scanAfter = vv.dateAdd(new Date(), 'minute', 5)
            parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `error creating folder "${item.path}" - ${error}`} as TMessageExportFs)
            parentPort.postMessage({kind: 'log.trace', subsystem: 'dir', text: `after 5 minutes next try for create folder "${item.path}"`} as TMessageExportFs)
            return
        }

        const files = [] as string[]
        try {
            files.push(...(await fs.readdir(item.path)).map(m => { return m?.toLowerCase() }))
        } catch (error) {
            item.scanAfter = vv.dateAdd(new Date(), 'minute', 5)
            parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `error scan folder "${item.path}" - ${error}`} as TMessageExportFs)
            parentPort.postMessage({kind: 'log.trace', subsystem: 'dir', text: `after 5 minutes next try for scan folder "${item.path}"`} as TMessageExportFs)
            return
        }

        files.forEach(async itemf => {
            const mask = item.mask.find(f => wildcard(f.maskFile, [itemf]).length > 0)
            if (!mask) return

            let stat = undefined as fs.Stats
            try {
                stat = await fs.stat(path.join(item.path, itemf))
                if (!stat.isFile()) return
            } catch (error) {
                parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `error check file "${path.join(item.path, itemf)}" - ${error}`} as TMessageExportFs)
                return
            }

            const fnd = env.scanFile.find(f => f.stamp.path === item.path && f.stamp.file === itemf)
            if (fnd) {
                if (!fnd.timeSendToMssql) {
                    if (fnd.stat.size === stat.size && fnd.stat.btime === stat.birthtimeMs && fnd.stat.mtime === stat.mtimeMs) {
                        fnd.countStat++
                    } else {
                        fnd.countStat = 1
                        fnd.stat.size = stat.size
                        fnd.stat.btime = stat.birthtimeMs
                        fnd.stat.mtime = stat.mtimeMs
                    }
                    if (fnd.countStat > 2) {
                        parentPort.postMessage({kind: 'file.load', stat: fnd.stat, stamp: fnd.stamp } as TMessageExportFs)
                        fnd.timeSendToMssql = new Date()
                    }
                }
                return
            }

            env.scanFile.push({
                stamp: {
                    path: item.path,
                    file: itemf,
                    movePathError: env.setting.fs.find(f => f.key === mask.scan.logFileErrorPathKey)?.path,
                    movePathSuccess: env.setting.fs.find(f => f.key === mask.scan.logFileSuccessPathKey)?.path,
                    queryLoad: env.setting.mssql.queries.find(f => f.key === mask.scan.queryLoadKey)?.query?.join(`\n`),
                    modeLoad: mask.scan.modeLoad
                },
                stat: {
                    size: stat.size,
                    btime: stat.birthtimeMs,
                    mtime: stat.mtimeMs
                },
                countStat: 1,
                timeSendToMssql: undefined
            })
        })
    }))

    timerScan.nextTick(1000)
})

const timerProcess = new Timer(2000, async () => {
    let item = env.fileProcess.shift()
    while (item) {

        const fullFileNamePath = item.kind === 'file.create' || item.kind === 'file.move' ? (
            env.setting?.fs.some(f => (f.key === 'success' || f.key === 'error') && f.path === item.pathDestination) ?
            path.join(item.pathDestination, vv.dateFormat(new Date(), 'yyyymmdd')) : item.pathDestination
        ) : undefined

        if (fullFileNamePath) {
            try {
                await fs.ensureDir(fullFileNamePath)
            } catch (error) {
                parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `can't create dir "${fullFileNamePath}" - ${error}` } as TMessageExportFs)
                item = env.fileProcess.shift()
                continue
            }
        }

        if (item.kind === 'file.create') {
            try {
                await fs.writeFile(path.join(fullFileNamePath, item.file), item.text, {encoding: 'utf8', flag: 'w'})
            } catch (error) {
                parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `can't create file "${path.join(fullFileNamePath, item.file)}" - ${error}` } as TMessageExportFs)
            }
            item = env.fileProcess.shift()
            continue
        }

        if (item.kind === 'file.move') {
            const f = path.join(item.path, item.file)
            let isExists = false
            try {
                isExists = await fs.exists(f)
            } catch (error) {
                parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `error check exists file "${f}" - ${error}` } as TMessageExportFs)
            }
            if (isExists) {
                if (vv.isEmpty(item.pathDestination)) {
                    try {
                        await fs.remove(f)
                    } catch (error) {
                        parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `error delete file "${f}" - ${error}` } as TMessageExportFs)
                    }
                } else {
                    const fd = path.join(fullFileNamePath, item.file)
                    try {
                        await fs.move(f, fd, {overwrite: true})
                    } catch (error) {
                        parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `error move file from "${f}" to "${fd}" - ${error}` } as TMessageExportFs)
                        env.fileProcess.unshift({kind: 'file.move', path: item.path, file: item.file, pathDestination: ""})
                    }
                }
            }
            item = env.fileProcess.shift()
            continue
        }

        item = env.fileProcess.shift()
    }
    timerProcess.nextTick(1000)
})

function buildScanPath() {
    const scanPath = [] as TScanPath[]
    env.setting?.scan.forEach((item, itemIdx) => {
        const fs = env.setting.fs.find(f => f.key === item.pathKey)
        if (!fs) {
            parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `setting.scan #${itemIdx} has bad pathKey = "${item.pathKey}"` } as TMessageExportFs)
            return
        }
        const p = path.parse(item.mask)
        const finishPath = path.join(fs.path, p.dir)

        const fnd = scanPath.find(f => f.path === finishPath)
        if (fnd) {
            fnd.mask.push({scan: item, maskFile: p.base.toLowerCase()})
        } else {
            scanPath.push({path: finishPath, mask: [{scan: item, maskFile: p.base.toLowerCase()}]})
        }
    })
    env.scanPath = scanPath

    const successPath = env.setting?.fs.find(f => f.key === 'success').path
    if (successPath) {
        try {
            fs.ensureDirSync(successPath)
        } catch (error) {
            parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `create for succes files path "${successPath}" - ${error}` } as TMessageExportFs)
        }
    }
    const errorPath = env.setting?.fs.find(f => f.key === 'error').path
    if (errorPath) {
        try {
            fs.ensureDirSync(errorPath)
        } catch (error) {
            parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `create for error files path "${errorPath}" - ${error}` } as TMessageExportFs)
        }
    }
}

parentPort.on('message', (command: TMessageImportFs) => {
    const unknownCommand = command.kind as string
    if (command.kind === 'setting') {
        if (JSON.stringify(command.setting?.scan) === JSON.stringify(env.setting?.scan)) return
        env.setting = command.setting
        buildScanPath()
    } else if (command.kind === 'file.move' || command.kind === 'file.create') {
        env.fileProcess.push(command)
    } else {
        parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `internal error - unknown command kind "${unknownCommand}"`} as TMessageExportFs)
    }
})