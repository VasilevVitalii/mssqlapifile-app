import path from 'path'
import fs from 'fs-extra'
import * as vv from 'vv-common'
import wildcard from 'wildcard'
import { workerData, parentPort } from 'worker_threads'
import { SettingScanModeLoadArr, TSetting, TSettingFs, TSettingModeLoad, TSettingQuery, TSettingScan } from '../core/setting'
import { Timer } from '../core/timer'
import { TFileStat, TWEfileCreate, TWEfileForget, TWEfileLoad, TWEfileMove, TWEfileStamp, TWEhold, TWElogDebug, TWElogError, TWElogTrace, TWEsetting } from '../exchange'
import { THoldState } from '../core/hold'

export type TWorkerDataFs = {currentPath: string, setting: TSetting}
export type TMessageImportFs = TWEsetting | TWEfileMove | TWEfileCreate | TWEfileForget | TWEhold
export type TMessageExportFs = TWEfileLoad | TWElogTrace | TWElogDebug | TWElogError

type TScanFile = {
    maskFile: string,
    stamp: TWEfileStamp,
    stat: TFileStat,
    countStat: number,
    timeSendToMssql?: Date,
    timeHoldBefore?: Date
}

type TScanPathMask = {
    maskFile: string,
    queryLoad: string,
    logFileSuccessPath: string,
    logFileErrorPath: string,
    modeLoad: TSettingModeLoad
}

type TScanPath = {
    path: string,
    mask: TScanPathMask[],
    scanAfter?: Date
}

const env = {
    holdState: 'holdManual' as THoldState,
    workerData: workerData as TWorkerDataFs,
    settingFs: [] as TSettingFs[],
    settingScan: [] as TSettingScan[],
    settingQueries: [] as TSettingQuery[],
    scanPath: [] as TScanPath[],
    scanFile: [] as TScanFile[],
    fileProcess: [] as (TWEfileMove | TWEfileCreate | TWEfileForget)[]
}

const timerScan = new Timer(2000, async () => {
    await Promise.all(env.scanPath.filter(f => !f.scanAfter || (new Date() > f.scanAfter)).map(async (item) => {
        if (!vv.isEmpty(item.scanAfter)) item.scanAfter = undefined

        try {
            await fs.ensureDir(item.path)
        } catch (error) {
            item.scanAfter = vv.dateAdd(new Date(), 'minute', 5)
            parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `error creating folder "${item.path}" - ${error}`} as TMessageExportFs)
            parentPort.postMessage({kind: 'log.trace', subsystem: 'dir', text: `after 5 minutes next try for create folder "${item.path}"`} as TMessageExportFs)
            return
        }

        const files = [] as string[]
        try {
            files.push(...(await fs.readdir(item.path)).map(m => { return m }))
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
                if (vv.isEmpty(fnd.timeSendToMssql)) {
                    if (fnd.stat.size === stat.size && fnd.stat.btime === stat.birthtimeMs && fnd.stat.mtime === stat.mtimeMs) {
                        fnd.countStat++
                    } else {
                        fnd.countStat = 1
                        fnd.stat.size = stat.size
                        fnd.stat.btime = stat.birthtimeMs
                        fnd.stat.mtime = stat.mtimeMs
                    }
                    const now = new Date()
                    if (fnd.countStat > 2 && (vv.isEmpty(fnd.timeHoldBefore) || now > fnd.timeHoldBefore)) {
                        fnd.timeSendToMssql = now
                        fnd.timeHoldBefore = undefined
                        parentPort.postMessage({kind: 'file.load', stat: fnd.stat, stamp: fnd.stamp } as TMessageExportFs)
                        parentPort.postMessage({kind: 'log.trace', subsystem: 'dir', text: `file sent to buffer queue for load to server "${path.join(item.path, itemf)}"`} as TMessageExportFs)
                    }
                }
                return
            }

            if (env.holdState === '') {
                env.scanFile.push({
                    maskFile: mask.maskFile,
                    stamp: {
                        path: item.path,
                        file: itemf,
                        movePathError: mask.logFileErrorPath,
                        movePathSuccess: mask.logFileSuccessPath,
                        queryLoad: mask.queryLoad,
                        modeLoad: mask.modeLoad
                    },
                    stat: {
                        size: stat.size,
                        btime: stat.birthtimeMs,
                        mtime: stat.mtimeMs
                    },
                    countStat: 1,
                    timeSendToMssql: undefined
                })
                parentPort.postMessage({kind: 'log.trace', subsystem: 'dir', text: `find new file in scan directory "${path.join(item.path, itemf)}"`} as TMessageExportFs)
            }
        })
    }))

    timerScan.nextTick(1000)
})

const timerProcess = new Timer(2000, async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const item = env.fileProcess.shift()
        if (vv.isEmpty(item)) {
            break
        }

        const fullFileNamePath = item.kind === 'file.create' || item.kind === 'file.move' ? (
            env.settingFs.some(f => (f.key === 'success' || f.key === 'error') && f.path === item.pathDestination) ?
            path.join(item.pathDestination, vv.dateFormat(new Date(), 'yyyymmdd')) : item.pathDestination
        ) : undefined

        if (fullFileNamePath) {
            try {
                await fs.ensureDir(fullFileNamePath)
            } catch (error) {
                parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `can't create dir "${fullFileNamePath}" - ${error}` } as TMessageExportFs)
                continue
            }
        }

        if (item.kind === 'file.create') {
            try {
                await fs.writeFile(path.join(fullFileNamePath, item.file), item.text, {encoding: 'utf8', flag: 'w'})
                parentPort.postMessage({kind: 'log.trace', subsystem: 'dir', text: `create new file "${path.join(fullFileNamePath, item.file)}"`} as TMessageExportFs)
            } catch (error) {
                parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `can't create file "${path.join(fullFileNamePath, item.file)}" - ${error}` } as TMessageExportFs)
            }
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
                        parentPort.postMessage({kind: 'log.trace', subsystem: 'dir', text: `delete file "${f}"`} as TMessageExportFs)
                    } catch (error) {
                        parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `error delete file "${f}" - ${error}` } as TMessageExportFs)
                        continue
                    }
                } else {
                    const fd = path.join(fullFileNamePath, item.file)
                    try {
                        await fs.move(f, fd, {overwrite: true})
                        parentPort.postMessage({kind: 'log.trace', subsystem: 'dir', text: `move file from "${f}" to "${fd}"`} as TMessageExportFs)
                    } catch (error) {
                        parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `error move file from "${f}" to "${fd}" - ${error}` } as TMessageExportFs)
                        env.fileProcess.unshift({kind: 'file.move', path: item.path, file: item.file, pathDestination: ""})
                        continue
                    }
                }
                const idx = env.scanFile.findIndex(f => item.kind === 'file.move' && f.stamp.path === item.path && f.stamp.file === item.file)
                if (idx >= 0) {
                    env.scanFile.splice(idx,1)
                }
            }
            continue
        }

        if (item.kind === 'file.forget') {
            const idx = env.scanFile.findIndex(f => item.kind === 'file.forget' && f.stamp.path === item.path && f.stamp.file === item.file)
            if (idx >= 0) {
                if (vv.isEmpty(item.beforeTime)) {
                    parentPort.postMessage({kind: 'log.trace', subsystem: 'dir', text: `file delete from scan list "${path.join(item.path, item.file)}"`} as TMessageExportFs)
                    env.scanFile.splice(idx,1)
                } else {
                    parentPort.postMessage({kind: 'log.trace', subsystem: 'dir', text: `file load rescheduled to "${vv.dateFormat(item.beforeTime, 'yyyy.mm.ddThh:mi:ss')}" "${path.join(item.path, item.file)}"`} as TMessageExportFs)
                    env.scanFile[idx].timeHoldBefore = item.beforeTime
                    env.scanFile[idx].timeSendToMssql = undefined
                }
            }
            continue
        }
    }
    timerProcess.nextTick(1000)
})

function buildScanPath(): TScanPath[] {
    const result = [] as TScanPath[]
    env.settingScan.forEach((item, itemIdx) => {
        const filePath = env.settingFs.find(f => f.key === item.pathKey)
        if (vv.isEmpty(filePath)) {
            parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `setting.scan #${itemIdx} has bad pathKey = "${item.pathKey}"` } as TMessageExportFs)
            return
        }
        const queryLoad = (env.settingQueries.find(f => f.key === item.queryLoadKey)?.query || []).join(`\n`)
        if (vv.isEmpty(queryLoad)) {
            parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `setting.scan #${itemIdx} has bad queryLoadKey = "${item.queryLoadKey}"` } as TMessageExportFs)
            return
        }
        const logFileSuccessPath = env.settingFs.find(f => f.key === item.logFileSuccessPathKey)?.path
        if (vv.isEmpty(logFileSuccessPath) && !vv.isEmpty(item.logFileSuccessPathKey)) {
            parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `setting.scan #${itemIdx} has bad logFileSuccessPathKey = "${item.logFileSuccessPathKey}"` } as TMessageExportFs)
            return
        }
        const logFileErrorPath = env.settingFs.find(f => f.key === item.logFileErrorPathKey)?.path
        if (vv.isEmpty(logFileErrorPath) && !vv.isEmpty(item.logFileErrorPathKey)) {
            parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `setting.scan #${itemIdx} has bad logFileErrorPathKey = "${item.logFileErrorPathKey}"` } as TMessageExportFs)
            return
        }
        if (vv.isEmpty(item.modeLoad) || !SettingScanModeLoadArr.includes(item.modeLoad)) {
            parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `setting.scan #${itemIdx} has bad modeLoad = "${item.modeLoad}"` } as TMessageExportFs)
            return
        }

        const maskParse = path.parse(item.mask)
        const scanFinishPath = path.join(filePath.path, maskParse.dir)

        const scanMask = {
            maskFile: maskParse.base,
            modeLoad: item.modeLoad,
            queryLoad: queryLoad,
            logFileSuccessPath: logFileSuccessPath,
            logFileErrorPath: logFileErrorPath
        } as TScanPathMask

        const fnd = result.find(f => f.path === scanFinishPath)
        if (fnd) {
            fnd.mask.push(scanMask)
        } else {
            result.push({path: scanFinishPath, mask: [scanMask]})
        }
    })
    return result
}

parentPort.on('message', (command: TMessageImportFs) => {
    const unknownCommand = command.kind as string
    if (command.kind === 'setting') {
        const settingFs = command.setting?.fs || []
        const settingScan = command.setting?.scan || []
        const settingQueries = command.setting?.mssql?.queries || []

        if (JSON.stringify(settingFs) === JSON.stringify(env.settingFs) && JSON.stringify(settingScan) === JSON.stringify(env.settingScan) && JSON.stringify(settingQueries) === JSON.stringify(env.settingQueries)) return

        parentPort.postMessage({kind: 'log.debug', subsystem: 'dir', text: `get new version setting`} as TMessageExportFs)

        env.settingFs = settingFs
        env.settingScan = settingScan
        env.settingQueries = settingQueries
        env.scanPath = buildScanPath()
        env.scanFile = env.scanFile.filter(f => !vv.isEmpty(f.timeSendToMssql))

    } else if (command.kind === 'file.move' || command.kind === 'file.create' || command.kind === 'file.forget') {
        env.fileProcess.push(command)
    } else if (command.kind === 'hold') {
        if (command.state === '') {
            parentPort.postMessage({kind: 'log.debug', subsystem: 'dir', text: `worker started`} as TMessageExportFs)
        } else if (command.state !== 'stop')  {
            parentPort.postMessage({kind: 'log.debug', subsystem: 'dir', text: `worker on pause (setting ... ${command.state})`} as TMessageExportFs)
        }
        env.holdState = command.state
    } else {
        parentPort.postMessage({kind: 'log.error', subsystem: 'dir', text: `internal error - unknown command kind "${unknownCommand}"`} as TMessageExportFs)
    }
})