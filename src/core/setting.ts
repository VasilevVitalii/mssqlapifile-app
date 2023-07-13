/* eslint-disable @typescript-eslint/naming-convention */
import path from 'path'
import fs from 'fs-extra'
import * as vv from 'vv-common'
import { Timer } from './timer'
export type TSettingQuery = {key: string, query: string[]}
export type TSettingModeLoad =
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
] as TSettingModeLoad[]

export type TSettingScan = {
    pathKey: string,
    mask: string,
    modeLoad: TSettingModeLoad,
    queryLoadKey: string,
    logFileSuccessPathKey: string,
    logFileErrorPathKey: string,
}

export type TSettingFs = {
    key: string, path: string
}

export type TSettingPause = {
    time: string, duration: number
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
        queryLoadErrorKey: string,
        queryLoadDigestKey: string
    },
    fs: TSettingFs[],
    scan: TSettingScan [],
    service: {
        holdManual: boolean,
        stop: {
            sunday: string,
            monday: string,
            tuesday: string,
            wednesday: string,
            thursday: string,
            friday: string,
            saturday: string
        },
        holdAuto: {
            sunday: TSettingPause,
            monday: TSettingPause,
            tuesday: TSettingPause,
            wednesday: TSettingPause,
            thursday: TSettingPause,
            friday: TSettingPause,
            saturday: TSettingPause
        }
    }
}

export class Setting {
    private _appPath = undefined as string
    private _settingJson = undefined as string
    private _taskReadSetting = undefined as Timer
    private _eventOnRead = undefined as (setting: TSetting, messages: string[], error: string) => void

    constructor(appPath: string) {
        this._appPath = appPath

        this._taskReadSetting = new Timer(2000, async () => {
            if (this._eventOnRead) {
                const result = await this._read()
                const change = JSON.stringify(result.setting) !== this._settingJson
                if (change || result.messages?.length > 0 || result.error) {
                    this._eventOnRead(result.setting, result.messages, result.error)
                }
            }
            this._taskReadSetting.nextTick(5000)
        })
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
                queryLoadErrorKey: vv.toString(dataJson?.mssql?.queryLoadErrorKey),
                queryLoadDigestKey: vv.toString(dataJson?.mssql?.queryLoadDigestKey),
            },
            fs: (Array.isArray(dataJson?.fs) ? dataJson.fs : []).map(m => { return {
                key: vv.toString(m?.key),
                path: vv.toString(m?.path),
            }}),
            scan: (Array.isArray(dataJson?.scan) ? dataJson.scan : []).map(m => { return {
                pathKey: vv.toString(m?.pathKey),
                mask: vv.toString(m?.mask),
                modeLoad: vv.toString(m?.modeLoad) as TSettingModeLoad,
                logFileErrorPathKey: vv.toString(m?.logFileErrorPathKey),
                logFileSuccessPathKey: vv.toString(m?.logFileSuccessPathKey),
                queryLoadKey: vv.toString(m?.queryLoadKey),
            }}),
            service: {
                holdManual: vv.toBool(dataJson?.service?.holdManual),
                stop: {
                    sunday: vv.toString(dataJson?.service?.stop?.sunday),
                    monday: vv.toString(dataJson?.service?.stop?.monday),
                    tuesday: vv.toString(dataJson?.service?.stop?.tuesday),
                    wednesday: vv.toString(dataJson?.service?.stop?.wednesday),
                    thursday: vv.toString(dataJson?.service?.stop?.thursday),
                    friday: vv.toString(dataJson?.service?.stop?.friday),
                    saturday: vv.toString(dataJson?.service?.stop?.saturday),
                },
                holdAuto : {
                    sunday: {time: vv.toString(dataJson?.service?.holdAuto?.sunday?.time) , duration: vv.toIntPositive(dataJson?.service?.holdAuto?.sunday?.duration)},
                    monday: {time: vv.toString(dataJson?.service?.holdAuto?.monday?.time) , duration: vv.toIntPositive(dataJson?.service?.holdAuto?.monday?.duration)},
                    tuesday: {time: vv.toString(dataJson?.service?.holdAuto?.tuesday?.time) , duration: vv.toIntPositive(dataJson?.service?.holdAuto?.tuesday?.duration)},
                    wednesday: {time: vv.toString(dataJson?.service?.holdAuto?.wednesday?.time) , duration: vv.toIntPositive(dataJson?.service?.holdAuto?.wednesday?.duration)},
                    thursday: {time: vv.toString(dataJson?.service?.holdAuto?.thursday?.time) , duration: vv.toIntPositive(dataJson?.service?.holdAuto?.thursday?.duration)},
                    friday: {time: vv.toString(dataJson?.service?.holdAuto?.friday?.time) , duration: vv.toIntPositive(dataJson?.service?.holdAuto?.friday?.duration)},
                    saturday: {time: vv.toString(dataJson?.service?.holdAuto?.saturday?.time) , duration: vv.toIntPositive(dataJson?.service?.holdAuto?.saturday?.duration)},
                }
            }
        } : d as TSetting

        if (setting.log.logAllowTrace === undefined) setting.log.logAllowTrace = d.log.logAllowTrace
        if (setting.log.logLifeDays === undefined) setting.log.logLifeDays = d.log.logLifeDays
        if (setting.log.logFileErrorLifeDays === undefined) setting.log.logFileErrorLifeDays = d.log.logFileErrorLifeDays
        if (setting.log.logFileSuccessLifeDays === undefined) setting.log.logFileSuccessLifeDays = d.log.logFileSuccessLifeDays
        if (setting.mssql.connection.instance === undefined) setting.mssql.connection.instance = d.mssql.connection.instance
        if (setting.mssql.connection.login === undefined) setting.mssql.connection.login = d.mssql.connection.login
        if (setting.mssql.connection.password === undefined) setting.mssql.connection.password = d.mssql.connection.password
        if (setting.mssql.connection.database === undefined) setting.mssql.connection.database = d.mssql.connection.database
        if (setting.mssql.maxStreams === undefined) setting.mssql.maxStreams = d.mssql.maxStreams
        setting.mssql.queries.forEach(item => item.key = item.key === undefined ? "" : item.key)
        if (setting.mssql.queryLoadErrorKey === undefined) setting.mssql.queryLoadErrorKey = ""
        if (setting.mssql.queryLoadDigestKey === undefined) setting.mssql.queryLoadDigestKey = ""
        setting.fs.forEach((item) => {
            if (item.key === undefined) item.key = ""
            if (item.path === undefined) item.path = ""
        })
        setting.scan.forEach((item) => {
            if (item.pathKey === undefined) item.pathKey = ""
            if (item.mask === undefined) item.mask = ""
            if (item.queryLoadKey === undefined) item.queryLoadKey = ""
            if (item.logFileErrorPathKey === undefined) item.logFileErrorPathKey = ""
            if (item.logFileSuccessPathKey === undefined) item.logFileSuccessPathKey = ""
        })
        if (setting.service.holdManual === undefined) setting.service.holdManual = false
        if (setting.service.stop.sunday === undefined) setting.service.stop.sunday = ''
        if (setting.service.stop.monday === undefined) setting.service.stop.monday = ''
        if (setting.service.stop.tuesday === undefined) setting.service.stop.tuesday = ''
        if (setting.service.stop.wednesday === undefined) setting.service.stop.wednesday = ''
        if (setting.service.stop.thursday === undefined) setting.service.stop.thursday = ''
        if (setting.service.stop.friday === undefined) setting.service.stop.friday = ''
        if (setting.service.stop.saturday === undefined) setting.service.stop.saturday = ''
        if (setting.service.holdAuto.sunday.time === undefined) setting.service.holdAuto.sunday.time = ''
        if (setting.service.holdAuto.monday.time === undefined) setting.service.holdAuto.monday.time = ''
        if (setting.service.holdAuto.tuesday.time === undefined) setting.service.holdAuto.tuesday.time = ''
        if (setting.service.holdAuto.wednesday.time === undefined) setting.service.holdAuto.wednesday.time = ''
        if (setting.service.holdAuto.thursday.time === undefined) setting.service.holdAuto.thursday.time = ''
        if (setting.service.holdAuto.friday.time === undefined) setting.service.holdAuto.friday.time = ''
        if (setting.service.holdAuto.saturday.time === undefined) setting.service.holdAuto.saturday.time = ''
        if (setting.service.holdAuto.sunday.duration === undefined) setting.service.holdAuto.sunday.duration = 0
        if (setting.service.holdAuto.monday.duration === undefined) setting.service.holdAuto.monday.duration = 0
        if (setting.service.holdAuto.tuesday.duration === undefined) setting.service.holdAuto.tuesday.duration = 0
        if (setting.service.holdAuto.wednesday.duration === undefined) setting.service.holdAuto.wednesday.duration = 0
        if (setting.service.holdAuto.thursday.duration === undefined) setting.service.holdAuto.thursday.duration = 0
        if (setting.service.holdAuto.friday.duration === undefined) setting.service.holdAuto.friday.duration = 0
        if (setting.service.holdAuto.saturday.duration === undefined) setting.service.holdAuto.saturday.duration = 0

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
                            "INSERT INTO [dbo].[YourDigestStorage] ([countSuccess], [countError], [countQueue])",
                            "SELECT @countSuccess, @countError, @countQueue"
                        ]
                    },
                    {
                        key: 'default',
                        query: [
                            "INSERT INTO [dbo].[YourFileStorage] ([filePath], [fileNameWithoutExt], [fileExt], [data])",
                            "SELECT @filePath, @fileNameWithoutExt, @fileExt, @data"
                        ]
                    }
                ],
                queryLoadErrorKey: 'error',
                queryLoadDigestKey: 'digest',
            },
            fs: [
                {key: 'success', path: path.join(this._appPath, 'scan', 'success')},
                {key: 'error', path: path.join(this._appPath, 'scan', 'error')},
                {key: 'scan', path: path.join(this._appPath, 'scan')},
                {key: 'folder2', path: path.join(this._appPath, 'scan', 'folder2')},

            ],
            scan: [
                {
                    pathKey: "scan",
                    mask: path.join('folder1', '*.txt'),
                    modeLoad: 'bodyAsUtf8',
                    logFileErrorPathKey: 'error',
                    logFileSuccessPathKey: 'success',
                    queryLoadKey: 'default'
                },
                {
                    pathKey: "scan",
                    mask: path.join('folder1', 'aa*.xlsx'),
                    modeLoad: 'xlsx2xml',
                    logFileErrorPathKey: 'error',
                    logFileSuccessPathKey: 'success',
                    queryLoadKey: 'default'
                },
                {
                    pathKey: "folder2",
                    mask: '*.png',
                    modeLoad: 'bodyAsBase64',
                    logFileErrorPathKey: 'error',
                    logFileSuccessPathKey: 'success',
                    queryLoadKey: 'default'
                },
            ],
            service: {
                holdManual: false,
                stop: {
                    sunday: '03:45',
                    monday: '',
                    tuesday: '',
                    wednesday: '',
                    thursday: '',
                    friday: '',
                    saturday: ''
                },
                holdAuto: {
                    sunday: {time: '23:35', duration: 300},
                    monday: {time: '00:35', duration: 240},
                    tuesday: {time: '00:35', duration: 240},
                    wednesday: {time: '00:35', duration: 240},
                    thursday: {time: '00:35', duration: 240},
                    friday: {time: '00:35', duration: 240},
                    saturday: {time: '23:35', duration: 300}
                }
            }
        }
    }
}