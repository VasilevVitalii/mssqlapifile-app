/* eslint-disable @typescript-eslint/naming-convention */
import { Create as LoggerManagerCreate, IApp as ILoggerManager, ILogger } from 'vv-logger'
import { Numerator } from './numerator'
import path from 'path'
import * as metronom from 'vv-metronom'

type TLoggerItemDigest = {
    countSuccess: number,
    countError: number
}
type TLoggerItem = {
    key: string
    isInFile: boolean,
    isInSql: boolean,
    subsystem: string,
    text: string,
    type: 'trace' | 'debug' | 'error' | 'digest',
    digest?: TLoggerItemDigest
}

const numerator = new Numerator('log')

export class Logger {

    private _appPath = undefined as string
    private _logLifeDays = undefined as number
    private _logAllowTrace = undefined as boolean
    private _logger = undefined as ILogger
    private _allowInFile = true
    private _allowInSql = false
    private _list = [] as TLoggerItem[]
    private _loggerManager = LoggerManagerCreate()
    private _taskLoggerFile = undefined as metronom.Metronom
    private _taskLoggerMssql = undefined as metronom.Metronom
    private _digest = {
        countError: 0,
        countSuccess: 0
    } as TLoggerItemDigest

    constructor(appPath: string) {
        this._appPath = appPath
        this._loggerManager = LoggerManagerCreate()
        this._loggerManager.onError(error => {
            this.LogError('log', error.message)
        })
        this._taskLoggerFile = metronom.Create({kind: 'cron', cron: '*/2 * * * * *'})
        this._taskLoggerFile.onTick(() => {
            this._onTaskLoggerFile()
            this._taskLoggerFile.allowNextTick()
        })
        this._taskLoggerFile.start()
        this._taskLoggerMssql = metronom.Create({kind: 'cron', cron: '0 */5 * * * *'})
        this._taskLoggerMssql.onTick(() => {
            this._onTaskLoggerMssql()
            this._taskLoggerMssql.allowNextTick()
        })
        this._taskLoggerMssql.start()
    }

    AllowInSql(value: boolean) {
        this._allowInSql = value
    }
    LogTrace(subsystem: string, text: string) {
        this._list.push({key: numerator.getKey(), subsystem, text, isInFile: false, isInSql: false, type: 'trace'})
    }
    LogDebug(subsystem: string, text: string) {
        this._list.push({key: numerator.getKey(),subsystem, text, isInFile: false, isInSql: false, type: 'debug'})
    }
    LogError(subsystem: string, text: string) {
        this._list.push({key: numerator.getKey(),subsystem, text, isInFile: false, isInSql: false, type: 'error'})
    }
    LogDigest(countSuccess: number, countError: number) {
        this._digest.countSuccess = this._digest.countSuccess + countSuccess
        this._digest.countError = this._digest.countError + countError
    }
    Restart(LogLifeDays: number, LogAllowTrace: boolean) {
        if (LogLifeDays === this._logLifeDays && LogAllowTrace === this._logAllowTrace) return
        this._allowInFile = false
        this._logLifeDays = LogLifeDays
        this._logAllowTrace = LogAllowTrace
        const logPath = path.join(this._appPath, 'log')

        setTimeout(() => {
            this._logger = this._loggerManager.addLogger ({
                consoleLevel: this._logAllowTrace ? 'trace' : 'debug',
                transports: [
                    {kind: 'file', dir: logPath, levels: ['error'], fileNamePrefix: 'error', fileLifeDay: this._logLifeDays},
                    {kind: 'file', dir: logPath, levels: ['debug', 'error'], fileNamePrefix: 'debug', fileLifeDay: this._logLifeDays},
                    this._logAllowTrace ? {kind: 'file', dir: logPath, levels: ['trace', 'debug', 'error'], fileNamePrefix: 'trace', fileLifeDay: this._logLifeDays} : undefined
                ]
            })
            this._allowInFile = true
        }, 5000)
    }

    private _onTaskLoggerFile() {
        if (!this._allowInFile || this._logger === undefined) return
        this._list.filter(f => !f.isInFile).forEach(item => {
            if (item.type === 'error') {
                this._logger.errorExt(item.subsystem, item.text)
            } else if (item.type === 'debug' || item.type === 'digest') {
                this._logger.debugExt(item.subsystem, item.text)
            } else if (item.type === 'trace') {
                this._logger.traceExt(item.subsystem, item.text)
            }
            item.isInFile = true
        })
    }

    private _onTaskLoggerMssql() {
        if (!this._allowInSql || this._logger !== undefined) return

        //TODO create

        console.log('MSSQL')

        //this._list.push({key: numerator.getKey(),subsystem: 'app', text: `success load ${countSuccess} file(s), error load ${countError} file(s)` , isInFile: false, isInSql: false, type: 'digest', digest: {countSuccess, countError}})
    }

}