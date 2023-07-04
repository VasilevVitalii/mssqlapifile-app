import fs from 'fs-extra'
import * as vv from 'vv-common'

import { TOptionsSourceScan, TOptionsSourceScanMode } from "./options";
import { appHold, appLogger, appMssql } from './app';
import path from 'path';

type TLoader = {
    path: string,
    file: string,
    stat: fs.Stats,
    countScan: number,
    state: 'wait' | 'process' | 'success' | 'error' | 'delete' | 'hold' | 'done',
    successPath: string,
    errorPath: string,
    queryLoad: string,
    mode: TOptionsSourceScanMode,
    holdExpire?: Date
}

export class Loader {
    scan = undefined as TOptionsSourceScan[]
    logSuccessPathDefault = undefined as string
    logErrorPathDefault = undefined as string
    maxThreads = 1 as number
    holdSec = undefined as number
    queryLoadDefault = undefined as string

    list = [] as TLoader[]

    constructor() {
        const self = this

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerScan = setTimeout(async function tick() {
            if (appHold.getHold() === false) {
                await self._onScan()
                timerScan = setTimeout(tick, 1000)
            } else {
                timerScan = setTimeout(tick, 5000)
            }
        }, 5000)

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerLoad = setTimeout(async function tick() {
            if (appHold.getHold() === false) {
                if (appMssql.getState() === 'no' || appMssql.getState() === 'lost') {
                    timerLoad = setTimeout(tick, 1000)
                    return
                }
                let countThreads = self.list.filter(f => f.state === 'process').length
                const countFreeThreads = self.maxThreads - countThreads
                if (countFreeThreads > 0) {
                    await self._onLoad(countFreeThreads)
                    countThreads = self.list.filter(f => f.state === 'process').length
                }
                const timeout = self._stateReadyForLoad.length > 0 ? 200 : 1000
                timerLoad = setTimeout(tick, timeout)
            } else {
                timerLoad = setTimeout(tick, 5000)
            }
        }, 5000)

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerUnhold = setTimeout(async function tick() {
            if (appHold.getHold() === false) {
                self.list
                    .filter(f => f.state === 'hold' && (vv.isEmpty(f.holdExpire) || (new Date()) > f.holdExpire))
                    .forEach(item => {
                        item.state = 'wait'
                        item.holdExpire = undefined
                        item.countScan = 0
                    })
                timerUnhold = setTimeout(tick, 1000)
            } else {
                timerUnhold = setTimeout(tick, 5000)
            }
        }, 1000)

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerMove = setTimeout(async function tick() {
            self._onMove()
            self._onDelete()
            timerMove = setTimeout(tick, 1000)
        }, 1000)

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerDone = setTimeout(async function tick() {
            if (appHold.getHold() === false) {
                self.list = self.list.filter(f => f.state !== 'done')
            } else {
                self.list = self.list.filter(f => f.state !== 'done' && f.state !== 'hold' && f.state !== 'wait')
            }
            timerDone = setTimeout(tick, 5000)
        }, 5000)
    }

    private _stateReadyForLoad(): TLoader[] {
        return this.list.filter(f => (f.state === 'wait' && f.countScan >= 3))
    }

    private async _onScan() {
        if (!this.scan || this.scan.length <= 0) {
            appLogger.trace('ldr', `array witn scan path is empty`)
            return
        }

        await Promise.all(this.scan.map(async (item) => {
            try {
                await fs.ensureDir(item.path)
            } catch (error) {
                appLogger.error('ldr', `error create/check dir "${item.path}" - ${error}`)
                return
            }

            let files = [] as {file: string, path: string, stat?: fs.Stats}[]
            try {
                files = (await fs.readdir(item.path)).map(m => {return {
                    file: m,
                    path: item.path,
                    stat: undefined
                }})
            } catch (error) {
                appLogger.error('ldr', `error read dir "${item.path}" - ${error}`)
                return
            }

            await Promise.all(files.map(async (itemf) => {
                try {
                    itemf.stat = await fs.stat(path.join(itemf.path, itemf.file))
                } catch (error) {
                    appLogger.error('ldr', `error get stat for file "${path.join(itemf.path, itemf.file)}" - ${error}`)
                    return
                }
            }))

            files.filter(f => f.stat?.isFile() === true).forEach(itemf => {
                const fnd = this.list.find(f => f.path === itemf.path && f.file === itemf.file)
                if (fnd) {
                    if (fnd.stat.mtimeMs === itemf.stat.mtimeMs && fnd.stat.birthtimeMs === itemf.stat.birthtimeMs && fnd.stat.size === itemf.stat.size) {
                        if (fnd.state === 'wait') {
                            fnd.countScan++
                        }
                    } else {
                        fnd.countScan = 1
                    }
                    if (fnd.countScan === 3 && fnd.state === 'wait') {
                        appLogger.trace('ldr', `ready for load file "${path.join(itemf.path, itemf.file)}", countScan = "${fnd.countScan}"`)
                    } else if (fnd.countScan === 100 || fnd.countScan === 1000 || fnd.countScan === 10000) {
                        appLogger.trace('ldr', `stays in the buffer for a long time file "${path.join(itemf.path, itemf.file)}", countScan = "${fnd.countScan}"`)
                    }
                } else {
                    const scan = this.scan.find(f => vv.equal(f.path, itemf.path))
                    if (!scan) {
                        appLogger.trace('ldr', `ignore file "${path.join(itemf.path, itemf.file)}"`)
                        return
                    }

                    this.list.push({
                        path: itemf.path,
                        file: itemf.file,
                        state: 'wait',
                        stat: itemf.stat,
                        countScan: 1,
                        queryLoad: scan.queryLoad.length > 0 ? scan.queryLoad.join(`\n`) : this.queryLoadDefault,
                        successPath: vv.isEmpty(scan.logSuccessPath) ? this.logSuccessPathDefault : scan.logSuccessPath,
                        errorPath: vv.isEmpty(scan.logErrorPath) ? this.logErrorPathDefault : scan.logErrorPath,
                        mode: scan.mode,
                    })
                    appLogger.trace('ldr', `find file "${path.join(itemf.path, itemf.file)}"`)
                }
            })
        }))
    }

    private async _onLoad(maxThreads: number) {
        for (let i = 1; i <= maxThreads; i++) {
            const item = this._stateReadyForLoad().at(0)
            if (!item) break

            item.state = 'process'

            if (vv.isEmpty(item.queryLoad)) {
                appLogger.error(`ldr`, `query for load file "${path.join(item.path, item.file)}" is empty`)
                item.state = 'error'
            }

            const parse = path.parse(item.file)
            const filePath = `'` + item.path.replaceAll(`'`,`''`) + `'`
            const fileNameWithoutExt = `'` + parse.name.replaceAll(`'`,`''`) + `'`
            const fileExt = `'` + parse.ext.replaceAll(`'`,`''`) + `'`

            let dataBodyAsUtf8 = 'NULL'
            let dataBodyAsBase64 = 'NULL'
            let dataBodyAsBinary = 'NULL'

            if (item.mode === 'bodyAsUtf8') {
                try {
                    dataBodyAsUtf8 = `'` + (await fs.readFile(path.join(item.path, item.file), 'utf8')).replaceAll(`'`, `''`) + `'`
                } catch (error) {
                    appLogger.error('ldr', `error read file ${path.join(item.path, item.file)} - ${error}`)
                    item.state = 'error'
                    break
                }
            } else if (item.mode === 'bodyAsBase64') {
                try {
                    dataBodyAsBase64 = `'` + await fs.readFile(path.join(item.path, item.file), 'base64') + `'`
                } catch (error) {
                    appLogger.error('ldr', `error read file ${path.join(item.path, item.file)} - ${error}`)
                    item.state = 'error'
                    break
                }
            } else if (item.mode === 'bodyAsBinary') {
                try {
                    dataBodyAsBinary = `'` + (await fs.readFile(path.join(item.path, item.file))).toString('hex') + `'`
                } catch (error) {
                    appLogger.error('ldr', `error read file ${path.join(item.path, item.file)} - ${error}`)
                    item.state = 'error'
                    break
                }
            }

            const query = [
                `IF OBJECT_ID('tempdb..#mssqlapifile_app_files') IS NOT NULL DROP TABLE #mssqlapifile_app_files`,
                `SELECT `,
                `     CONVERT(NVARCHAR(MAX), ${filePath}) [filePath]`,
                `    ,CONVERT(NVARCHAR(MAX), ${fileNameWithoutExt}) [fileNameWithoutExt]`,
                `    ,CONVERT(NVARCHAR(MAX), ${fileExt}) [fileExt]`,
                `    ,CONVERT(NVARCHAR(MAX), ${dataBodyAsUtf8}) [data_bodyAsUtf8]`,
                `    ,CONVERT(NVARCHAR(MAX), ${dataBodyAsBase64}) [data_bodyAsBase64]`,
                `    ,CONVERT(VARBINARY(MAX), ${dataBodyAsBinary}) [data_bodyAsBinary]`,
                `INTO #mssqlapifile_app_files`
            ].join(`\n`) + `\n` + item.queryLoad

            appMssql.execCallback(query, (state, error, data) => {
                if (state === 'no' || state === 'error-connect') {
                    item.state = 'hold'
                    item.countScan = 0
                    item.holdExpire = vv.dateAdd(new Date(), 'minute', 1)
                    if (state === 'no') {
                        appLogger.trace('ldr', `connect to mssql is bad, will be re-uploaded later file "${path.join(item.path, item.file)}"`)
                    } else {
                        appLogger.error('ldr', `connect to mssql is bad, will be re-uploaded later file "${path.join(item.path, item.file)}"`)
                    }
                    return
                }
                if (error) {
                    appLogger.addToDigestError()
                    appLogger.error('ldr', `error load to mssql file "${path.join(item.path, item.file)}" - ${error}`)
                    appLogger.trace('ldr', query)
                    item.state = 'error'
                    return
                }
                if (vv.toBool(data?.at(-1)?.rows?.at(-1)?.hold) === true) {
                    item.countScan = 0
                    item.holdExpire = vv.dateAdd(new Date(), 'second', this.holdSec)
                    appLogger.trace('ldr', `load to mssql file "${path.join(item.path, item.file)}" on hold, next try after ${this.holdSec} second(s)`)
                    item.state = 'hold'
                    return
                }

                appLogger.addToDigestSuccess()
                appLogger.trace('ldr', `success load file "${path.join(item.path, item.file)}"`)
                item.state = 'success'
            })
        }
    }

    private async _onMove() {
        const list = this.list.filter(f => f.state === 'success' || f.state === 'error')
        if (list.length <= 0) return
        const suffixPath = vv.dateFormat(new Date(), 'yyyymmdd')
        list.forEach(async item => {
            let targetPath = undefined as string
            if (item.state === 'success' && !vv.isEmpty(item.successPath)) {
                targetPath = path.join(item.successPath, suffixPath)
            } else if (item.state === 'error' && !vv.isEmpty(item.errorPath)) {
                targetPath = path.join(item.errorPath, suffixPath)
            }
            if (vv.isEmpty(targetPath)) {
                item.state = 'delete'
                return
            }

            try {
                await fs.ensureDir(targetPath)
            } catch (error) {
                appLogger.error('ldr', `error create/check dir "${targetPath}" - ${error}`)
                item.state = 'delete'
                return
            }

            const moveFrom = path.join(item.path, item.file)
            const moveTo = path.join(targetPath, item.file)
            try {
                await fs.move(moveFrom, moveTo, {overwrite: true})
                appLogger.trace('ldr', `success move file from "${moveFrom}" to "${moveTo}"`)
                item.state = 'done'
            } catch (error) {
                appLogger.error('ldr', `error move file from "${moveFrom}" to "${moveTo}" - ${error}`)
                item.state = 'delete'
            }
        })
    }

    private async _onDelete() {
        const list = this.list.filter(f => f.state === 'delete')
        if (list.length <= 0) return
        list.forEach(async item => {
            const deleteFile = path.join(item.path, item.file)
            try {
                await fs.unlink(deleteFile)
                appLogger.trace('ldr', `success delete file "${deleteFile}"`)
                item.state = 'done'
            } catch (error) {
                appLogger.error('ldr', `error delete file "${deleteFile}" - ${error}`)
            }
        })
    }
}


