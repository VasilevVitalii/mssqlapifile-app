/* eslint-disable @typescript-eslint/naming-convention */
import fs from 'fs-extra'
import path from 'path'
import * as vv from 'vv-common'
import { appLogger } from './app'

export type TOptionsSourceScanMode = 'bodyAsUtf8' | 'bodyAsBase64' | 'bodyAsBinary' | 'fullFileName'

export type TOptionsSourceScanConverterXlsx = 'none' | 'xml' | 'json'

export type TOptionsSourceScan = {
    mode: TOptionsSourceScanMode
    path: string,
    queryLoad: string[],
    logSuccessPath: string,
    logErrorPath: string,
    converter: {
        xlsx: TOptionsSourceScanConverterXlsx
    }
}

export type TOptions = {
    log: {
        lifeDays: number,
        allowTrace: boolean
    },
    mssql: {
        connection: {
            instance: string,
            login: string,
            password: string,
            database: string,
        },
        maxThreads: number,
        holdSec: number,
        queryLoadErrors: string[],
        queryLoadDigest: string[],
        queryLoadDefault: string[],
    },
    source: {
        scan: TOptionsSourceScan[],
        logSuccessLifeDays: number,
        logErrorLifeDays: number,
        logSuccessPathDefault: string,
        logErrorPathDefault: string
    },
    service: {
        holdManual: boolean,
        holdAuto: {
            weekSunday: boolean,
            weekMonday: boolean,
            weekTuesday: boolean,
            weekWednesday: boolean,
            weekThursday: boolean,
            weekFriday: boolean,
            weekSaturday: boolean
            time: string
        }
    }
}

const OPTIONS_LOG_ALLOWTRACE = false
const OPTIONS_LOG_LIFEDAYS = 10
const OPTIONS_MSSQL_CONNECTION_INSTANCE = 'localhost,1433'
const OPTIONS_MSSQL_CONNECTION_LOGIN = 'sa'
const OPTIONS_MSSQL_CONNECTION_PASSWORD = '123456'
const OPTIONS_MSSQL_CONNECTION_DATABASE = 'tempdb'
const OPTIONS_MSSQL_MAXTHREADS = 8
const OPTIONS_MSSQL_HOLDSEC = 30
const OPTIONS_MSSQL_QUERYLOADERRORS = [
    "INSERT INTO [dbo].[YourErrorStorage] ([error])",
    "SELECT [error] FROM #mssqlapifile_app_errors ORDER BY [id]"
]
const OPTIONS_MSSQL_QUERYLOADDIGEST = [
    "INSERT INTO [dbo].[YourDigestStorage] ([message],[countSuccess],[countError])",
    "SELECT [message],[countSuccess],[countError] FROM #mssqlapifile_app_digest ORDER BY [id]"
]
const OPTIONS_MSSQL_QUERYLOADDEFAULT = [
    "INSERT INTO [dbo].[YourFileStorage] ([data])",
    "SELECT [data_bodyAsUtf8] FROM #mssqlapifile_app_files"
]
const OPTIONS_SOURCE_SCAN_MODE1 = 'bodyAsUtf8'
const OPTIONS_SOURCE_SCAN_MODE2 = 'bodyAsBase64'
const OPTIONS_SOURCE_SCAN_PATH1 = path.join('scan', 'source1')
const OPTIONS_SOURCE_SCAN_PATH2 = path.join('scan', 'source2')
const OPTIONS_SOURCE_SCAN_QUERYLOAD1 = OPTIONS_MSSQL_QUERYLOADDEFAULT
const OPTIONS_SOURCE_SCAN_QUERYLOAD2 = [
    "INSERT INTO [dbo].[YourFileStorage] ([data])",
    "SELECT [data_bodyAsBase64] FROM #mssqlapifile_app_files"
]
const OPTIONS_SOURCE_SCAN_CONVERTER_XLSX = 'none'
const OPTIONS_SOURCE_SCAN_CONVERTER_XLSX1 = 'xml'
const OPTIONS_SOURCE_SCAN_CONVERTER_XLSX2 = 'json'
const OPTIONS_SOURCE_SCAN_LOGSUCCESSPATH = path.join('scan', 'success')
const OPTIONS_SOURCE_SCAN_LOGERRORPATH = path.join('scan', 'error')
const OPTIONS_SOURCE_LOGSUCCESSLIFEDAYS = 30
const OPTIONS_SOURCE_LOGERRORLIFEDAYS = 30
const OPTIONS_SOURCE_LOGSUCCESSPATHDEFAULT = path.join('scan', 'success')
const OPTIONS_SOURCE_LOGERRORPATHDEFAULT = path.join('scan', 'error')

const OPTIONS_SERVICE_HOLDMANUAL = false
const OPTIONS_SERVICE_HOLDAUTO_WEEKSUNDAY = true
const OPTIONS_SERVICE_HOLDAUTO_WEEKMONDAY = false
const OPTIONS_SERVICE_HOLDAUTO_WEEKTUESDAY = false
const OPTIONS_SERVICE_HOLDAUTO_WEEKWEDNESDAY = false
const OPTIONS_SERVICE_HOLDAUTO_WEEKTHURSDAY = false
const OPTIONS_SERVICE_HOLDAUTO_WEEKFRIDAY = false
const OPTIONS_SERVICE_HOLDAUTO_WEEKSATURDAY = false
const OPTIONS_SERVICE_HOLDAUTO_TIME = "03:15"

export function OptionsDefault(): TOptions {
    return {
        log: {
            lifeDays: OPTIONS_LOG_LIFEDAYS,
            allowTrace: OPTIONS_LOG_ALLOWTRACE
        },
        mssql: {
            connection: {
                instance: OPTIONS_MSSQL_CONNECTION_INSTANCE,
                login: OPTIONS_MSSQL_CONNECTION_LOGIN,
                password: OPTIONS_MSSQL_CONNECTION_PASSWORD,
                database: OPTIONS_MSSQL_CONNECTION_DATABASE,
            },
            maxThreads: OPTIONS_MSSQL_MAXTHREADS,
            holdSec: OPTIONS_MSSQL_HOLDSEC,
            queryLoadErrors: OPTIONS_MSSQL_QUERYLOADERRORS,
            queryLoadDigest: OPTIONS_MSSQL_QUERYLOADDIGEST,
            queryLoadDefault: OPTIONS_MSSQL_QUERYLOADDEFAULT,
        },
        source: {
            scan: [
                {
                    mode: OPTIONS_SOURCE_SCAN_MODE1,
                    path: OPTIONS_SOURCE_SCAN_PATH1,
                    logSuccessPath: OPTIONS_SOURCE_SCAN_LOGSUCCESSPATH,
                    logErrorPath: OPTIONS_SOURCE_SCAN_LOGERRORPATH,
                    queryLoad: OPTIONS_SOURCE_SCAN_QUERYLOAD1,
                    converter: {
                        xlsx: OPTIONS_SOURCE_SCAN_CONVERTER_XLSX1
                    }
                },
                {
                    mode: OPTIONS_SOURCE_SCAN_MODE2,
                    path: OPTIONS_SOURCE_SCAN_PATH2,
                    logSuccessPath: OPTIONS_SOURCE_SCAN_LOGSUCCESSPATH,
                    logErrorPath: OPTIONS_SOURCE_SCAN_LOGERRORPATH,
                    queryLoad: OPTIONS_SOURCE_SCAN_QUERYLOAD2,
                    converter: {
                        xlsx: OPTIONS_SOURCE_SCAN_CONVERTER_XLSX2
                    }
                },
            ],
            logSuccessLifeDays: OPTIONS_SOURCE_LOGSUCCESSLIFEDAYS,
            logErrorLifeDays: OPTIONS_SOURCE_LOGERRORLIFEDAYS,
            logSuccessPathDefault: OPTIONS_SOURCE_LOGSUCCESSPATHDEFAULT,
            logErrorPathDefault: OPTIONS_SOURCE_LOGERRORPATHDEFAULT,
        },
        service: {
            holdManual: OPTIONS_SERVICE_HOLDMANUAL,
            holdAuto: {
                weekSunday: OPTIONS_SERVICE_HOLDAUTO_WEEKSUNDAY,
                weekMonday: OPTIONS_SERVICE_HOLDAUTO_WEEKMONDAY,
                weekTuesday: OPTIONS_SERVICE_HOLDAUTO_WEEKTUESDAY,
                weekWednesday: OPTIONS_SERVICE_HOLDAUTO_WEEKWEDNESDAY,
                weekThursday: OPTIONS_SERVICE_HOLDAUTO_WEEKTHURSDAY,
                weekFriday: OPTIONS_SERVICE_HOLDAUTO_WEEKFRIDAY,
                weekSaturday: OPTIONS_SERVICE_HOLDAUTO_WEEKSATURDAY,
                time: OPTIONS_SERVICE_HOLDAUTO_TIME
            }
        }
    }
}

export class Options {
    private _fullFileName = undefined as string
    private _optionsStringify = undefined as string
    private _onChange = undefined as (options: TOptions) => void

    constructor() {
        const self = this
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerLoad = setTimeout(async function tick() {
            const options = await self._onRead()
            const optionsStr = JSON.stringify(options)
            let hasChanges = false
            if (self._optionsStringify !== optionsStr) {
                hasChanges = true
                self._optionsStringify = optionsStr
            }
            if (hasChanges && self._onChange) {
                self._onChange(options)
            }
            timerLoad = setTimeout(tick, 1000 * 10)
        }, 0)
    }

    setCurrentPath(currentPath: string) {
        this._fullFileName = path.join(currentPath, 'mssqlapifile-app.json')
    }

    onChange(onChange: (options: TOptions) => void) {
        this._onChange = onChange
    }

    private async _onRead(): Promise<TOptions> {
        if (!this._fullFileName) return
        const currPath = path.dirname(this._fullFileName)
        const dataRaw = await fs.exists(this._fullFileName) ? await fs.readFile(this._fullFileName, 'utf8') : undefined

        if (dataRaw === undefined) {
            const optDefault = OptionsDefault()
            optDefault.source.scan.forEach(item => {
                item.path = path.join(currPath, item.path)
                item.logSuccessPath = path.join(currPath, item.logSuccessPath)
                item.logErrorPath = path.join(currPath, item.logErrorPath)
            })
            optDefault.source.logSuccessPathDefault = path.join(currPath, optDefault.source.logSuccessPathDefault)
            optDefault.source.logErrorPathDefault = path.join(currPath, optDefault.source.logErrorPathDefault)
            try {
                await fs.writeFile(this._fullFileName, JSON.stringify(optDefault, null, 4), 'utf8')
                appLogger.debug('opt', `generate default setting file ${this._fullFileName}`)
            } catch (error) {
                appLogger.error('opt', `error save setting file ${this._fullFileName} - ${error}`)
            }
            return optDefault
        }

        const dataJson = JSON.parse(dataRaw) as TOptions

        const opt: TOptions = {
            log: {
                lifeDays: vv.toIntPositive(dataJson?.log?.lifeDays),
                allowTrace: vv.toBool(dataJson?.log?.allowTrace)
            },
            mssql: {
                connection: {
                    instance: vv.toString(dataJson?.mssql?.connection?.instance),
                    login: vv.toString(dataJson?.mssql?.connection?.login),
                    password: vv.toString(dataJson?.mssql?.connection?.password),
                    database: vv.toString(dataJson?.mssql?.connection?.database),
                },
                maxThreads: vv.toIntPositive (dataJson?.mssql?.maxThreads),
                holdSec: vv.toIntPositive (dataJson?.mssql?.holdSec),
                queryLoadDefault: (Array.isArray(dataJson?.mssql?.queryLoadDefault) ? dataJson.mssql.queryLoadDefault : []),
                queryLoadErrors: (Array.isArray(dataJson?.mssql?.queryLoadErrors) ? dataJson.mssql.queryLoadErrors : []),
                queryLoadDigest: (Array.isArray(dataJson?.mssql?.queryLoadDigest) ? dataJson.mssql.queryLoadDigest : []),
            },
            source: {
                scan: (Array.isArray(dataJson?.source?.scan) ? dataJson.source.scan : []),
                logSuccessLifeDays: vv.toIntPositive(dataJson?.source?.logSuccessLifeDays),
                logErrorLifeDays: vv.toIntPositive(dataJson?.source?.logErrorLifeDays),
                logErrorPathDefault: vv.toString(dataJson?.source?.logErrorPathDefault),
                logSuccessPathDefault: vv.toString(dataJson?.source?.logSuccessPathDefault)
            },
            service: {
                holdManual: vv.toBool(dataJson?.service?.holdManual),
                holdAuto: {
                    weekSunday: vv.toBool(dataJson?.service?.holdAuto?.weekSunday),
                    weekMonday: vv.toBool(dataJson?.service?.holdAuto?.weekMonday),
                    weekTuesday: vv.toBool(dataJson?.service?.holdAuto?.weekTuesday),
                    weekWednesday: vv.toBool(dataJson?.service?.holdAuto?.weekWednesday),
                    weekThursday: vv.toBool(dataJson?.service?.holdAuto?.weekThursday),
                    weekFriday: vv.toBool(dataJson?.service?.holdAuto?.weekFriday),
                    weekSaturday: vv.toBool(dataJson?.service?.holdAuto?.weekSaturday),
                    time: vv.toString(dataJson?.service?.holdAuto?.time)
                }
            }
        }

        if (opt.log.lifeDays === undefined || opt.log.lifeDays < 0) {
            opt.log.lifeDays = OPTIONS_LOG_LIFEDAYS
            appLogger.debug('opt', `change and save param log.lifeDays = "${OPTIONS_LOG_LIFEDAYS}"`)
        }
        if (opt.log.allowTrace === undefined) {
            opt.log.allowTrace = OPTIONS_LOG_ALLOWTRACE
            appLogger.debug('opt', `change and save param log.allowTrace = "${OPTIONS_LOG_ALLOWTRACE}"`)
        }
        if (vv.isEmpty(opt.mssql.connection.instance)) {
            opt.mssql.connection.instance = OPTIONS_MSSQL_CONNECTION_INSTANCE
            appLogger.debug('opt', `change and save param mssql.connection.instance = "${OPTIONS_MSSQL_CONNECTION_INSTANCE}"`)
        }
        if (vv.isEmpty(opt.mssql.connection.login)) {
            opt.mssql.connection.login = OPTIONS_MSSQL_CONNECTION_LOGIN
            appLogger.debug('opt', `change and save param mssql.connection.login = "${OPTIONS_MSSQL_CONNECTION_LOGIN}"`)
        }
        if (vv.isEmpty(opt.mssql.connection.password)) {
            opt.mssql.connection.password = OPTIONS_MSSQL_CONNECTION_PASSWORD
            appLogger.debug('opt', `change and save param mssql.connection.password = "${OPTIONS_MSSQL_CONNECTION_PASSWORD}"`)
        }
        if (vv.isEmpty(opt.mssql.connection.database)) {
            opt.mssql.connection.database = OPTIONS_MSSQL_CONNECTION_DATABASE
            appLogger.debug('opt', `change and save param mssql.connection.database = "${OPTIONS_MSSQL_CONNECTION_DATABASE}"`)
        }
        if (opt.mssql.maxThreads === undefined || opt.mssql.maxThreads < 0) {
            opt.mssql.maxThreads = OPTIONS_MSSQL_MAXTHREADS
            appLogger.debug('opt', `change and save param mssql.maxThreads = "${OPTIONS_MSSQL_MAXTHREADS}"`)
        }
        if (opt.mssql.holdSec === undefined || opt.mssql.holdSec < 0) {
            opt.mssql.holdSec = OPTIONS_MSSQL_HOLDSEC
            appLogger.debug('opt', `change and save param mssql.holdSec = "${OPTIONS_MSSQL_HOLDSEC}"`)
        }
        const newQueryLoadErrors = opt.mssql.queryLoadErrors.map(m => vv.toString(m)?.trim()).filter(f => !vv.isEmpty(f))
        if (JSON.stringify(newQueryLoadErrors) !== JSON.stringify(opt.mssql.queryLoadErrors)) {
            opt.mssql.queryLoadErrors = newQueryLoadErrors
            appLogger.debug('opt', `change and save param mssql.queryLoadErrors - <see in file>`)
        }
        const newQueryLoadDigest = opt.mssql.queryLoadDigest.map(m => vv.toString(m)?.trim()).filter(f => !vv.isEmpty(f))
        if (JSON.stringify(newQueryLoadDigest) !== JSON.stringify(opt.mssql.queryLoadDigest)) {
            opt.mssql.queryLoadDigest = newQueryLoadDigest
            appLogger.debug('opt', `change and save param mssql.queryLoadDigest - <see in file>`)
        }
        const newQueryLoadDefault = opt.mssql.queryLoadDefault.map(m => vv.toString(m)?.trim()).filter(f => !vv.isEmpty(f))
        if (JSON.stringify(newQueryLoadDefault) !== JSON.stringify(opt.mssql.queryLoadDefault)) {
            opt.mssql.queryLoadDefault = newQueryLoadDefault
            appLogger.debug('opt', `change and save param mssql.queryLoadDefault - <see in file>`)
        }
        if (opt.source.logSuccessLifeDays === undefined || opt.source.logSuccessLifeDays < 0) {
            opt.source.logSuccessLifeDays = OPTIONS_SOURCE_LOGSUCCESSLIFEDAYS
            appLogger.debug('opt', `change and save param source.logSuccessLifeDays = "${OPTIONS_SOURCE_LOGSUCCESSLIFEDAYS}"`)
        }
        if (opt.source.logErrorLifeDays === undefined || opt.source.logErrorLifeDays < 0) {
            opt.source.logErrorLifeDays = OPTIONS_SOURCE_LOGERRORLIFEDAYS
            appLogger.debug('opt', `change and save param source.logErrorLifeDays = "${OPTIONS_SOURCE_LOGERRORLIFEDAYS}"`)
        }
        let newLogSuccessPathDefault = opt.source.logSuccessPathDefault?.trim()
        newLogSuccessPathDefault = !vv.isEmpty(newLogSuccessPathDefault) && !path.isAbsolute(newLogSuccessPathDefault) ? path.join(currPath, newLogSuccessPathDefault) : newLogSuccessPathDefault
        if (opt.source.logSuccessPathDefault !== newLogSuccessPathDefault) {
            opt.source.logSuccessPathDefault = newLogSuccessPathDefault
            appLogger.debug('opt', `change and save param source.logSuccessPathDefault = "${newLogSuccessPathDefault}"`)
        }
        let newlogErrorPathDefault = opt.source.logErrorPathDefault?.trim()
        newlogErrorPathDefault = !vv.isEmpty(newlogErrorPathDefault) && !path.isAbsolute(newlogErrorPathDefault) ? path.join(currPath, newlogErrorPathDefault) : newlogErrorPathDefault
        if (opt.source.logErrorPathDefault !== newlogErrorPathDefault) {
            opt.source.logErrorPathDefault = newlogErrorPathDefault
            appLogger.debug('opt', `change and save param source.logErrorPathDefault = "${newlogErrorPathDefault}"`)
        }
        opt.source.scan.forEach((item, itemIdx) => {
            if (item.mode !== 'bodyAsUtf8' && item.mode !== 'bodyAsBase64' && item.mode !== 'bodyAsBinary' && item.mode !== 'fullFileName') {
                item.mode = OPTIONS_SOURCE_SCAN_MODE1
                appLogger.debug('opt', `change and save param source.scan #${itemIdx + 1} = "${OPTIONS_SOURCE_SCAN_MODE1}"`)
            }
            let newPath = item.path?.trim()
            newPath = !vv.isEmpty(newPath) && !path.isAbsolute(newPath) ? path.join(currPath, newPath) : newPath
            if (item.path !== newPath) {
                item.path = newPath
                appLogger.debug('opt', `change and save param scan.path(#${itemIdx + 1}) = "${newPath}"`)
            }
            let newlogSuccessPath = item.logSuccessPath?.trim()
            newlogSuccessPath = !vv.isEmpty(newlogSuccessPath) && !path.isAbsolute(newlogSuccessPath) ? path.join(currPath, newlogSuccessPath) : newlogSuccessPath
            if (item.logSuccessPath !== newlogSuccessPath) {
                item.logSuccessPath = newlogSuccessPath
                appLogger.debug('opt', `change and save param scan.logSuccessPath(#${itemIdx + 1}) = "${newlogSuccessPath}"`)
            }
            let newlogErrorPath = item.logErrorPath?.trim()
            newlogErrorPath = !vv.isEmpty(newlogErrorPath) && !path.isAbsolute(newlogErrorPath) ? path.join(currPath, newlogErrorPath) : newlogErrorPath
            if (item.logErrorPath !== newlogErrorPath) {
                item.logErrorPath = newlogErrorPath
                appLogger.debug('opt', `change and save param scan.logErrorPath(#${itemIdx + 1}) = "${newlogErrorPath}"`)
            }
            const queryLoad = item.queryLoad.map(m => vv.toString(m)?.trim()).filter(f => !vv.isEmpty(f))
            if (JSON.stringify(queryLoad) !== JSON.stringify(item.queryLoad)) {
                item.queryLoad = queryLoad
                appLogger.debug('opt', `change and save param scan.queryLoad(#${itemIdx + 1}) - <see in file>`)
            }
            item.converter = {
                xlsx: vv.toString(item.converter?.xlsx) as any
            }
            if (item.converter.xlsx !== 'xml' && item.converter.xlsx !== 'json' && item.converter.xlsx !== 'none') {
                item.converter.xlsx = OPTIONS_SOURCE_SCAN_CONVERTER_XLSX
                appLogger.debug('opt', `change and save param scan.converter.xlsx #${itemIdx + 1} = "${OPTIONS_SOURCE_SCAN_CONVERTER_XLSX}"`)
            }
        })
        if (opt.service.holdManual === undefined) {
            opt.service.holdManual = OPTIONS_SERVICE_HOLDMANUAL
            appLogger.debug('opt', `change and save param service.holdManual = "${OPTIONS_SERVICE_HOLDMANUAL}"`)
        }
        if (opt.service.holdAuto.weekSunday === undefined) {
            opt.service.holdAuto.weekSunday = OPTIONS_SERVICE_HOLDAUTO_WEEKSUNDAY
            appLogger.debug('opt', `change and save param service.holdAuto.weekSunday = "${OPTIONS_SERVICE_HOLDAUTO_WEEKSUNDAY}"`)
        }
        if (opt.service.holdAuto.weekMonday === undefined) {
            opt.service.holdAuto.weekMonday = OPTIONS_SERVICE_HOLDAUTO_WEEKMONDAY
            appLogger.debug('opt', `change and save param service.holdAuto.weekMonday = "${OPTIONS_SERVICE_HOLDAUTO_WEEKMONDAY}"`)
        }
        if (opt.service.holdAuto.weekTuesday === undefined) {
            opt.service.holdAuto.weekTuesday = OPTIONS_SERVICE_HOLDAUTO_WEEKTUESDAY
            appLogger.debug('opt', `change and save param service.holdAuto.weekTuesday = "${OPTIONS_SERVICE_HOLDAUTO_WEEKTUESDAY}"`)
        }
        if (opt.service.holdAuto.weekWednesday === undefined) {
            opt.service.holdAuto.weekWednesday = OPTIONS_SERVICE_HOLDAUTO_WEEKWEDNESDAY
            appLogger.debug('opt', `change and save param service.holdAuto.weekWednesday = "${OPTIONS_SERVICE_HOLDAUTO_WEEKWEDNESDAY}"`)
        }
        if (opt.service.holdAuto.weekThursday === undefined) {
            opt.service.holdAuto.weekThursday = OPTIONS_SERVICE_HOLDAUTO_WEEKTHURSDAY
            appLogger.debug('opt', `change and save param service.holdAuto.weekThursday = "${OPTIONS_SERVICE_HOLDAUTO_WEEKTHURSDAY}"`)
        }
        if (opt.service.holdAuto.weekFriday === undefined) {
            opt.service.holdAuto.weekFriday = OPTIONS_SERVICE_HOLDAUTO_WEEKFRIDAY
            appLogger.debug('opt', `change and save param service.holdAuto.weekFriday = "${OPTIONS_SERVICE_HOLDAUTO_WEEKFRIDAY}"`)
        }
        if (opt.service.holdAuto.weekSaturday === undefined) {
            opt.service.holdAuto.weekSaturday = OPTIONS_SERVICE_HOLDAUTO_WEEKSATURDAY
            appLogger.debug('opt', `change and save param service.holdAuto.weekSaturday = "${OPTIONS_SERVICE_HOLDAUTO_WEEKSATURDAY}"`)
        }
        if (opt.service.holdAuto.time?.length !== 5 || !(new RegExp(`^(2[0-3]|[01]?[0-9]):([0-5]?[0-9])$`)).test(opt.service.holdAuto.time)) {
            opt.service.holdAuto.time = OPTIONS_SERVICE_HOLDAUTO_TIME
            appLogger.debug('opt', `change and save param service.holdAuto.time = "${OPTIONS_SERVICE_HOLDAUTO_TIME}"`)
        }

        if (JSON.stringify(opt, null, 4) !== dataRaw) {
            try {
                await fs.writeFile(this._fullFileName, JSON.stringify(opt, null, 4), 'utf8')
            } catch (error) {
                appLogger.error('opt', `error save setting file ${this._fullFileName} - ${error}`)
            }
        }

        const isQueryLoadDefaultEmpty = opt.mssql.queryLoadDefault.length === 0
        const scan = [] as TOptionsSourceScan[]
        for (let i = 0; i < opt.source.scan.length; i++) {
            const item1 = opt.source.scan[i]
            if (vv.isEmpty(item1.path)) {
                appLogger.debug('opt', `ignore scan #${i + 1} - path is empty`)
                break
            }
            if (isQueryLoadDefaultEmpty && vv.isEmpty(item1.queryLoad)) {
                appLogger.debug('opt', `ignore scan #${i + 1} - queryLoad and queryLoadDefault are empty`)
                break
            }

            let doubleIdx = -1
            for (let j = i + 1; j < opt.source.scan.length; j++) {
                const item2 = opt.source.scan[j]
                if (vv.equal(item1.path, item2.path)) {
                    doubleIdx = j
                    break
                }
            }
            if (doubleIdx >= 0) {
                appLogger.debug('opt', `ignore scan #${i + 1} - same path in scan #${doubleIdx + 1}`)
                break
            }
            scan.push(item1)
        }
        opt.source.scan = scan

        const isLogErrorPathDefault = vv.isEmpty(opt.source.logErrorPathDefault)
        const isLogSuccessPathDefault = vv.isEmpty(opt.source.logSuccessPathDefault)
        if (isLogErrorPathDefault || isLogSuccessPathDefault) {
            opt.source.scan.forEach((item, itemIdx) => {
                if (isLogErrorPathDefault && vv.isEmpty(item.logErrorPath)) {
                    appLogger.debug('opt', `scan #${itemIdx + 1} - logErrorPathDefault and logErrorPath are empty, files with error load will be deleted`)
                }
                if (isLogSuccessPathDefault && vv.isEmpty(item.logSuccessPath)) {
                    appLogger.debug('opt', `scan #${itemIdx + 1} - logSuccessPathDefault and logSuccessPath are empty, files with success load will be deleted`)
                }
            })
        }

        return opt
    }
}