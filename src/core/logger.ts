/* eslint-disable @typescript-eslint/naming-convention */
import { Create as LoggerManagerCreate, ILogger } from 'vv-logger'
import { Numerator } from './numerator'
import path from 'path'
import { Timer } from './timer'
import { TWElogDigestLoad, TWElogErrorLoad } from '../exchange'

type TLogger = {
    key: string
    isInFile: boolean,
    isInSql: boolean,
    subsystem: string,
    text: string,
    type: 'trace' | 'debug' | 'error'
} | {
    key: string
    isInFile: boolean,
    isInSql: boolean,
    type: 'digest',
    digestCountSuccess?: number
    digestCountError?: number
    digestCountQueue?: number
}

const numerator = new Numerator('log')

export class Logger {

    private _appPath = undefined as string
    private _logLifeDays = undefined as number
    private _logAllowTrace = undefined as boolean
    private _logger = undefined as ILogger
    private _allowInFile = true
    private _list = [] as TLogger[]
    private _loggerManager = LoggerManagerCreate()
    private _taskLoggerFile = undefined as Timer
    private _taskLoggerMssql = undefined as Timer
    private _eventOnMssql = undefined as (log: (TWElogDigestLoad | TWElogErrorLoad)) => void

    constructor(appPath: string) {
        this._appPath = appPath
        this._loggerManager = LoggerManagerCreate()
        this._loggerManager.onError(error => {
            this.logError('log', error.message)
        })

        this._taskLoggerFile = new Timer(2000, () => {
            this._onTaskLoggerFile()
            this._taskLoggerFile.nextTick()
        })

        this._taskLoggerMssql = new Timer(1000 * 30, () => {
            this._onTaskLoggerMssql()
            this._list
                .filter(f => f.isInFile && f.isInSql)
                .forEach(item => this._list.splice(this._list.findIndex(f => f.key === item.key), 1))
            this._taskLoggerMssql.nextTick(1000 * 60)
        })
    }

    eventOnMssql(proc: (log: (TWElogDigestLoad | TWElogErrorLoad)) => void) {
        this._eventOnMssql = proc
    }
    logTrace(subsystem: string, text: string) {
        this._list.push({key: numerator.getKey(), subsystem, text, isInFile: false, isInSql: false, type: 'trace'})
    }
    logDebug(subsystem: string, text: string) {
        this._list.push({key: numerator.getKey(),subsystem, text, isInFile: false, isInSql: false, type: 'debug'})
    }
    logError(subsystem: string, text: string) {
        this._list.push({key: numerator.getKey(),subsystem, text, isInFile: false, isInSql: false, type: 'error'})
    }
    logDigest(countSuccess: number, countError: number, countQueue: number) {
        this._list.push({key: numerator.getKey(), isInFile: false, isInSql: false, type: 'digest', digestCountSuccess: countSuccess, digestCountError: countError, digestCountQueue: countQueue})
    }
    stop() {
        setTimeout(() => {
            this._loggerManager.finish(() => {})
        }, 1000 * 5)
    }
    restart(LogLifeDays: number, LogAllowTrace: boolean) {
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
            if (item.type === 'trace') {
                this._logger.traceExt(item.subsystem, item.text)
            } else if (item.type === 'debug') {
                this._logger.debugExt(item.subsystem, item.text)
            } else if (item.type === 'digest') {
                this._logger.debugExt('app', `digest: success load ${item.digestCountSuccess} file(s), error load ${item.digestCountError} file(s), queue ${item.digestCountQueue}`)
            } else if (item.type === 'error') {
                this._logger.errorExt(item.subsystem, item.text)
            }
            item.isInFile = true
        })
    }

    private _onTaskLoggerMssql() {
        if (this._logger === undefined || this._eventOnMssql === undefined) return

        const errLoad = {kind: 'log.load.error', list: []} as TWElogErrorLoad
        const digLoad = [] as TWElogDigestLoad[]

        this._list.filter(f => !f.isInSql).slice(0, 99).forEach(item => {
            if (item.type === 'digest') {
                digLoad.push({kind: 'log.load.digest', digest: {countSuccess: item.digestCountSuccess, countError: item.digestCountError, countQueue: item.digestCountQueue}})
            } else if (item.type === 'error') {
                errLoad.list.push({subsystem: item.subsystem, text: item.text})
            }
            item.isInSql = true
        })

        if (errLoad.list.length > 0) {
            this._eventOnMssql(errLoad)
        }
        digLoad.forEach(item => {
            this._eventOnMssql(item)
        })
        if (errLoad.list.length + digLoad.length > 90) {
            this._onTaskLoggerMssql()
        }
    }

}