/* eslint-disable @typescript-eslint/naming-convention */
import path from 'path'
import fs from 'fs-extra'
import * as vv from 'vv-common'
import * as metronom from 'vv-metronom'
export type TSettingQuery = {key: string, query: string[]}
export type TSettingScanModeLoad =
    'bodyAsUtf8' |
    'bodyAsBase64' |
    'bodyAsBinary' |
    'fullFileName' |
    'xlsx2json' |
    'xlsx2xml'
export const SettingScanModeLoadArr = [
    'bodyAsUtf8',
    'bodyAsBase64',
    'bodyAsBinary',
    'fullFileName',
    'xlsx2json',
    'xlsx2xml'
] as TSettingScanModeLoad[]

export type TSettingScan = {
    mask: string,
    modeLoad: TSettingScanModeLoad,
    queryLoadKey: string,
    logFileSuccessPath: string,
    logFileErrorPath: string,
}

export type TSetting = {
    log: {
        logLifeDays: number,
        logAllowTrace: boolean,
        logFileSuccessLifeDays: number,
        logFileErrorLifeDays: number
    },
    mssql: {
        connection: {
            instance: string,
            login: string,
            password: string,
            database: string,
        },
        maxStreams: number,
        queries: TSettingQuery[],
        queryLoadErrorsKey: string,
        queryLoadDigestKey: string,
    },
    scan: TSettingScan [],
    service: {
        hold: boolean,
        stop: {
            sunday: boolean,
            monday: boolean,
            tuesday: boolean,
            wednesday: boolean,
            thursday: boolean,
            friday: boolean,
            saturday: boolean,
            time: string
        }
    }
}

export class Setting {
    private _appPath = undefined as string
    private _settingJson = undefined as string
    private _taskReadSetting = undefined as metronom.Metronom
    private _eventOnRead = undefined as (setting: TSetting, messages: string[], error: string) => void

    constructor(appPath: string) {
        this._appPath = appPath
        this._taskReadSetting = metronom.Create({kind: 'cron', cron: '*/5 * * * * *'})
        this._taskReadSetting.onTick(async () => {
            if (this._eventOnRead) {
                const result = await this._read()
                const change = JSON.stringify(result.setting) !== this._settingJson
                if (change || result.messages?.length > 0 || result.error) {
                    this._eventOnRead(result.setting, result.messages, result.error)
                }
            }
            this._taskReadSetting.allowNextTick()
        })
        this._taskReadSetting.start()
    }

    eventOnRead(proc: (setting: TSetting, messages: string[], error: string) => void) {
        this._eventOnRead = proc
    }

    private async _read(): Promise<{setting: TSetting; messages: string[]; error: string}> {
        const fullFileName = path.join(this._appPath, 'mssqlapifile-app.json')
        const d = this._default()

        let existsFile = false
        try {
            existsFile = await fs.exists(fullFileName)
        } catch (error) {
            return {
                setting: d,
                messages: [],
                error: `use default settings, because error check exists file "${fullFileName}" - ${error}`
            }
        }

        let dataRaw = undefined as string
        let dataJson = undefined as TSetting
        const messages = [] as string[]

        if (existsFile) {
            try {
                dataRaw = await fs.readFile(fullFileName, 'utf8')
            } catch (error) {
                return {
                    setting: d,
                    messages: [],
                    error: `use default settings, because error read file "${fullFileName}" - ${error}`
                }
            }

            try {
                dataJson = dataRaw && dataRaw.length > 0 ? JSON.parse(dataRaw) : undefined
            } catch (error) {
                return {
                    setting: d,
                    messages: [],
                    error: `use default settings, because error parse to json file "${fullFileName}" - ${error}`
                }
            }
        } else {
            messages.push(`create default settings, because not find file "${fullFileName}"`)
        }

        const setting = existsFile ? {
            log: {
                logAllowTrace: vv.toBool(dataJson?.log?.logAllowTrace),
                logLifeDays: vv.toIntPositive(dataJson?.log?.logLifeDays),
                logFileErrorLifeDays: vv.toIntPositive(dataJson?.log?.logFileErrorLifeDays),
                logFileSuccessLifeDays: vv.toIntPositive(dataJson?.log?.logFileSuccessLifeDays),
            },
            mssql: {
                connection: {
                    instance: vv.toString(dataJson?.mssql?.connection?.instance),
                    login: vv.toString(dataJson?.mssql?.connection?.login),
                    password: vv.toString(dataJson?.mssql?.connection?.password),
                    database: vv.toString(dataJson?.mssql?.connection?.database),
                },
                maxStreams: vv.toIntPositive(dataJson?.mssql?.maxStreams),
                queries: (Array.isArray(dataJson?.mssql?.queries) ? dataJson.mssql.queries : []).map(m => { return {
                    key: vv.toString(m?.key),
                    query: (Array.isArray(m?.query) ? m.query : []).map(mm => { return vv.toString(mm)}).filter(f => !vv.isEmpty(f))
                }}),
                queryLoadErrorsKey: vv.toString(dataJson?.mssql?.queryLoadErrorsKey),
                queryLoadDigestKey: vv.toString(dataJson?.mssql?.queryLoadDigestKey),
            },
            scan: (Array.isArray(dataJson?.scan) ? dataJson.scan : []).map(m => { return {
                mask: vv.toString(m?.mask),
                modeLoad: vv.toString(m?.modeLoad) as TSettingScanModeLoad,
                logFileErrorPath: vv.toString(m?.logFileErrorPath),
                logFileSuccessPath: vv.toString(m?.logFileSuccessPath),
                queryLoadKey: vv.toString(m?.queryLoadKey),
            }}),
            service: {
                hold: vv.toBool(dataJson?.service?.hold),
                stop: {
                    sunday: vv.toBool(dataJson?.service?.stop?.sunday),
                    monday: vv.toBool(dataJson?.service?.stop?.monday),
                    tuesday: vv.toBool(dataJson?.service?.stop?.tuesday),
                    wednesday: vv.toBool(dataJson?.service?.stop?.wednesday),
                    thursday: vv.toBool(dataJson?.service?.stop?.thursday),
                    friday: vv.toBool(dataJson?.service?.stop?.friday),
                    saturday: vv.toBool(dataJson?.service?.stop?.saturday),
                    time: vv.toString (dataJson?.service?.stop?.time),
                }
            }
        } : d as TSetting

        if (setting.log.logAllowTrace === undefined) {
            setting.log.logAllowTrace = d.log.logAllowTrace
            messages.push(`change and save param "log.logAllowTrace" = "${setting.log.logAllowTrace}"`)
        }
        if (setting.log.logLifeDays === undefined) {
            setting.log.logLifeDays = d.log.logLifeDays
            messages.push(`change and save param "log.logLifeDays" = "${setting.log.logLifeDays}"`)
        }
        if (setting.log.logFileErrorLifeDays === undefined) {
            setting.log.logFileErrorLifeDays = d.log.logFileErrorLifeDays
            messages.push(`change and save param "log.logFileErrorLifeDays" = "${setting.log.logFileErrorLifeDays}"`)
        }
        if (setting.log.logFileSuccessLifeDays === undefined) {
            setting.log.logFileSuccessLifeDays = d.log.logFileSuccessLifeDays
            messages.push(`change and save param "log.logFileSuccessLifeDays" = "${setting.log.logFileSuccessLifeDays}"`)
        }
        if (setting.mssql.connection.instance === undefined) {
            setting.mssql.connection.instance = d.mssql.connection.instance
            messages.push(`change and save param "mssql.connection.instance" = "${setting.mssql.connection.instance}"`)
        }
        if (setting.mssql.connection.login === undefined) {
            setting.mssql.connection.login = d.mssql.connection.login
            messages.push(`change and save param "mssql.connection.login" = "${setting.mssql.connection.login}"`)
        }
        if (setting.mssql.connection.password === undefined) {
            setting.mssql.connection.password = d.mssql.connection.password
            messages.push(`change and save param "mssql.connection.password" = "${setting.mssql.connection.password}"`)
        }
        if (setting.mssql.connection.database === undefined) {
            setting.mssql.connection.database = d.mssql.connection.database
            messages.push(`change and save param "mssql.connection.database" = "${setting.mssql.connection.database}"`)
        }
        if (setting.mssql.maxStreams === undefined) {
            setting.mssql.maxStreams = d.mssql.maxStreams
            messages.push(`change and save param "mssql.maxStreams" = "${setting.mssql.maxStreams}"`)
        }
        setting.mssql.queries.forEach(item => item.key = item.key === undefined ? "" : item.key)
        if (setting.mssql.queryLoadErrorsKey === undefined) {
            setting.mssql.queryLoadErrorsKey = d.mssql.queryLoadErrorsKey
            messages.push(`change and save param "mssql.queryLoadErrorsKey" = "${setting.mssql.queryLoadErrorsKey}"`)
        }
        if (setting.mssql.queryLoadDigestKey === undefined) {
            setting.mssql.queryLoadDigestKey = d.mssql.queryLoadDigestKey
            messages.push(`change and save param "mssql.queryLoadDigestKey" = "${setting.mssql.queryLoadDigestKey}"`)
        }
        setting.scan.forEach((item, itemIdx) => {
            if (item.mask === undefined) item.mask = ""
            if (item.queryLoadKey === undefined) item.queryLoadKey = ""
            if (item.modeLoad === undefined) {
                item.modeLoad = d.scan[0].modeLoad
                messages.push(`change and save param "mssql.scan[${itemIdx}].modeLoad" = "${item.modeLoad}"`)
            }
            if (item.logFileErrorPath === undefined) {
                item.logFileErrorPath = d.scan[0].logFileErrorPath
                messages.push(`change and save param "mssql.scan[${itemIdx}].logFileErrorPath" = "${item.logFileErrorPath}"`)
            }
            if (item.logFileSuccessPath === undefined) {
                item.logFileSuccessPath = d.scan[0].logFileSuccessPath
                messages.push(`change and save param "mssql.scan[${itemIdx}].logFileSuccessPath" = "${item.logFileSuccessPath}"`)
            }
        })
        if (setting.service.hold === undefined) {
            setting.service.hold = d.service.hold
            messages.push(`change and save param "service.hold" = "${setting.service.hold}"`)
        }
        if (setting.service.stop.sunday === undefined) {
            setting.service.stop.sunday = d.service.stop.sunday
            messages.push(`change and save param "service.stop.sunday" = "${setting.service.stop.sunday}"`)
        }
        if (setting.service.stop.monday === undefined) {
            setting.service.stop.monday = d.service.stop.monday
            messages.push(`change and save param "service.stop.monday" = "${setting.service.stop.monday}"`)
        }
        if (setting.service.stop.tuesday === undefined) {
            setting.service.stop.tuesday = d.service.stop.tuesday
            messages.push(`change and save param "service.stop.tuesday" = "${setting.service.stop.tuesday}"`)
        }
        if (setting.service.stop.wednesday === undefined) {
            setting.service.stop.wednesday = d.service.stop.wednesday
            messages.push(`change and save param "service.stop.wednesday" = "${setting.service.stop.wednesday}"`)
        }
        if (setting.service.stop.thursday === undefined) {
            setting.service.stop.thursday = d.service.stop.thursday
            messages.push(`change and save param "service.stop.thursday" = "${setting.service.stop.thursday}"`)
        }
        if (setting.service.stop.friday === undefined) {
            setting.service.stop.friday = d.service.stop.friday
            messages.push(`change and save param "service.stop.friday" = "${setting.service.stop.friday}"`)
        }
        if (setting.service.stop.saturday === undefined) {
            setting.service.stop.saturday = d.service.stop.saturday
            messages.push(`change and save param "service.stop.saturday" = "${setting.service.stop.saturday}"`)
        }
        if (setting.service.stop.time === undefined) {
            setting.service.stop.time = d.service.stop.time
            messages.push(`change and save param "service.stop.time" = "${setting.service.stop.time}"`)
        }

        const settingJson = JSON.stringify(setting, null, 4)
        let errorSave = undefined as string
        if (dataJson === undefined || JSON.stringify(dataJson, null, 4) !== settingJson) {
            try {
                await fs.writeFile(fullFileName, settingJson, 'utf8')
            } catch (error) {
                errorSave = `${errorSave}`
            }
        }
        return {
            setting: setting,
            messages: messages,
            error: errorSave
        }
    }

    private _default(): TSetting {
        return {
            log: {
                logAllowTrace: false,
                logLifeDays: 30,
                logFileErrorLifeDays: 30,
                logFileSuccessLifeDays: 30
            },
            mssql: {
                connection: {
                    instance: 'localhost, 1433',
                    login: 'sa',
                    password: '123456',
                    database: 'yourDatabase',
                },
                maxStreams: 8,
                queries: [
                    {
                        key: 'error',
                        query: [
                            "INSERT INTO [dbo].[YourErrorStorage] ([message])",
                            "SELECT [message] FROM #mssqlapifile_app_errors ORDER BY [id]"
                        ]
                    },
                    {
                        key: 'digest',
                        query: [
                            "INSERT INTO [dbo].[YourDigestStorage] ([message],[countSuccess],[countError])",
                            "SELECT [[message],[countSuccess],[countError] FROM #mssqlapifile_app_digest ORDER BY [id]"
                        ]
                    },
                    {
                        key: 'default',
                        query: [
                            "INSERT INTO [dbo].[YourFileStorage] ([filePath], [fileNameWithoutExt], [fileExt], [data])",
                            "SELECT [filePath], [fileNameWithoutExt], [fileExt], [data] FROM #mssqlapifile_app_files"
                        ]
                    }
                ],
                queryLoadErrorsKey: 'error',
                queryLoadDigestKey: 'digest',
            },
            scan: [
                {
                    mask: path.join(this._appPath, 'scan', 'folder1', '*.txt'),
                    modeLoad: 'bodyAsUtf8',
                    logFileErrorPath: path.join(this._appPath, 'scan', 'error'),
                    logFileSuccessPath: path.join(this._appPath, 'scan', 'success'),
                    queryLoadKey: 'default'
                },
                {
                    mask: path.join(this._appPath, 'scan', 'folder1', 'aa*.xlsx'),
                    modeLoad: 'xlsx2xml',
                    logFileErrorPath: path.join(this._appPath, 'scan', 'error'),
                    logFileSuccessPath: path.join(this._appPath, 'scan', 'success'),
                    queryLoadKey: 'default'
                },
                {
                    mask: path.join(this._appPath, 'scan', 'folder2', '*.png'),
                    modeLoad: 'bodyAsBase64',
                    logFileErrorPath: path.join(this._appPath, 'scan', 'error'),
                    logFileSuccessPath: path.join(this._appPath, 'scan', 'success'),
                    queryLoadKey: 'default'
                },
            ],
            service: {
                hold: false,
                stop: {
                    sunday: true,
                    monday: false,
                    tuesday: false,
                    wednesday: false,
                    thursday: false,
                    friday: false,
                    saturday: false,
                    time: '03:45'
                }
            }
        }
    }
}