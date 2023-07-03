import { Create as LoggerManagerCreate, IApp as ILoggerManager, ILogger } from 'vv-logger'
import { appMssql } from './app'
import * as vv from 'vv-common'
import * as metronom from 'vv-metronom'

type TLoggerStateMessage = 'wait' | 'done'

type TLoggerMessage = {stateLog: TLoggerStateMessage, stateMssql: TLoggerStateMessage, subsystem: string, text: string, type: 'trace' | 'debug' | 'error' | 'digest'}

export class Logger {
    private _loggerManager = undefined as ILoggerManager
    private _logger = undefined as ILogger
    private _logDir = undefined as string
    private _loglifeDays = undefined as number
    private _allowTrace = undefined as boolean
    private _queryLoadErrors = undefined as string
    private _queryLoadDigest = undefined as string
    private _prevLogDir = undefined as string
    private _prevLoglifeDays = undefined as number
    private _prevAllowTrace = undefined as boolean
    private _canWork = false
    private _list = [] as TLoggerMessage[]
    private _digest = {
        countSuccess: 0,
        countError: 0
    }

    constructor() {
        this._loggerManager = LoggerManagerCreate()
        this._loggerManager.onError(error => {
            console.error(error)
        })
        const self = this

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerLog = setTimeout(function tick() {
            self._onTimerLog()
            timerLog = setTimeout(tick, 1000)
        }, 1000)

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerMssql = setTimeout(async function tick() {
            await self._onTimerMssqlDigest()

            const countSavedErrors = await self._onTimerMssqlErrors()
            const timer = countSavedErrors > 50 ? 0 : 1000 * 10
            timerMssql = setTimeout(tick, timer)
        }, 1000 * 10)

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerClear = setTimeout(function tick() {
            self._list = self._list.filter(f => f.stateMssql !== 'done' || f.stateLog !== 'done')
            timerClear = setTimeout(tick, 1000 * 60 * 5)
        }, 1000 * 60 * 5)

        const metronomDigest = metronom.Create({
            kind: 'cron',
            cron: '0 */2 * * * *'
        })
        metronomDigest.onTick(() => {
            const countSuccess = this._digest.countSuccess
            const countError = this._digest.countError
            this._digest.countSuccess = 0
            this._digest.countError = 0
            this._list.push({subsystem: 'log', text: `digest for last 30 minutes: success load ${countSuccess} file(s), error load ${countError} file(s)`, type: 'digest', stateLog: 'wait', stateMssql: 'wait'})
        })
        metronomDigest.start()
    }

    setLogDir(logDir: string) {
        this._prevLogDir = this._logDir
        this._logDir = logDir
    }

    setLoglifeDays(loglifeDays: number) {
        this._prevLoglifeDays = this._loglifeDays
        this._loglifeDays = loglifeDays
    }

    setAllowTrace(allowTrace: boolean) {
        this._prevAllowTrace = this._allowTrace
        this._allowTrace = allowTrace
    }

    setQueryLoadErrors(queryLoadErrors: string) {
        this._queryLoadErrors = queryLoadErrors
    }

    setQueryLoadDigest(queryLoadDigest: string) {
        this._queryLoadDigest = queryLoadDigest
    }

    addToDigestSuccess() {
        this._digest.countSuccess++
    }

    addToDigestError() {
        this._digest.countError++
    }

    init() {
        let need = false
        if (this._prevLogDir !== this._logDir) {
            this._prevLogDir = this._logDir
            need = true
        }
        if (this._prevLoglifeDays !== this._loglifeDays) {
            this._prevLoglifeDays = this._loglifeDays
            need = true
        }
        if (this._prevAllowTrace !== this._allowTrace) {
            this._prevAllowTrace = this._allowTrace
            need = true
        }
        if (need) {
            this._canWork = false
            this._logger = this._loggerManager.addLogger ({
                consoleLevel: this._allowTrace ? 'trace' : 'debug',
                transports: [
                    {kind: 'file', dir: this._logDir, levels: ['error'], fileNamePrefix: 'error', fileLifeDay: this._loglifeDays},
                    {kind: 'file', dir: this._logDir, levels: ['debug', 'error'], fileNamePrefix: 'debug', fileLifeDay: this._loglifeDays},
                    this._allowTrace ? {kind: 'file', dir: this._logDir, levels: ['trace', 'debug', 'error'], fileNamePrefix: 'trace', fileLifeDay: this._loglifeDays} : undefined,
                ]
            })
            this._canWork = true
        }
    }

    debug(subsystem: string, text: string) {
        this._list.push({subsystem: subsystem, text: text, type: 'debug', stateLog: 'wait', stateMssql: 'done'})
    }

    trace(subsystem: string, text: string) {
        this._list.push({subsystem: subsystem, text: text, type: 'trace', stateLog: 'wait', stateMssql: 'done'})
    }

    error(subsystem: string, text: string) {
        this._list.push({subsystem: subsystem, text: text, type: 'error', stateLog: 'wait', stateMssql: 'wait'})
    }

    private _onTimerLog() {
        if (this._canWork !== true) return

        this._list.filter(f => f.stateLog === 'wait').forEach(item => {
            if (item.type === 'debug' || item.type === 'digest') {
                this._logger.debugExt(item.subsystem, item.text)
            } else if (item.type === 'trace') {
                this._logger.traceExt(item.subsystem, item.text)
            } else if (item.type === 'error') {
                this._logger.errorExt(item.subsystem, item.text)
            }
            item.stateLog = 'done'
        })
    }

    private async _onTimerMssqlErrors(): Promise<number> {
        if (appMssql.getState() === 'no' || appMssql.getState() === 'lost') {
            return 0
        }

        const query = [] as string[]
        const list = this._list.filter(f => f.stateMssql === 'wait' && f.type === 'error').slice(0, 100)
        if (vv.isEmpty(this._queryLoadErrors)) {
            list.forEach(item => item.stateMssql = 'done')
            return 0
        }

        list.forEach(item => {
            const queryErrorText = item.text.replaceAll(`'`, `''`)
            query.push(`SELECT '${queryErrorText}' [error]`)
        })
        if (query.length <= 0) return 0

        const queryText = [
            "IF OBJECT_ID('tempdb..#mssqlapifile_app_errors') IS NOT NULL DROP TABLE #mssqlapifile_app_errors",
            "CREATE TABLE #mssqlapifile_app_errors([id] INT NOT NULL IDENTITY(1,1), [error] VARCHAR(MAX))",
            "INSERT INTO #mssqlapifile_app_errors([error])",
        ].join(`\n`) + `\n` + query.join(` UNION ALL\n`) + `\n` + this._queryLoadErrors
        const execResult = await appMssql.exec(queryText)
        if (execResult.state === 'no') return 0

        if (execResult.error) {
            this.error('log', `error on save errors to MSSQL - ${execResult.error}`)
            return 0
        } else {
            list.forEach(item => item.stateMssql = 'done')
            return list.length
        }
    }

    private async _onTimerMssqlDigest() {
        if (appMssql.getState() === 'no' || appMssql.getState() === 'lost') {
            return
        }

        const query = [] as string[]
        const list = this._list.filter(f => f.stateMssql === 'wait' && f.type === 'digest')
        if (vv.isEmpty(this._queryLoadDigest)) {
            list.forEach(item => item.stateMssql = 'done')
            return
        }

        list.forEach(item => {
            const queryDigestText = item.text.replaceAll(`'`, `''`)
            query.push(`SELECT '${queryDigestText}' [message]`)
        })
        if (query.length <= 0) return 0

        const queryText = [
            "IF OBJECT_ID('tempdb..#mssqlapifile_app_digest') IS NOT NULL DROP TABLE #mssqlapifile_app_digest",
            "CREATE TABLE #mssqlapifile_app_digest([id] INT NOT NULL IDENTITY(1,1), [message] VARCHAR(MAX))",
            "INSERT INTO #mssqlapifile_app_digest([message])",
        ].join(`\n`) + `\n` + query.join(` UNION ALL\n`) + `\n` + this._queryLoadDigest
        const execResult = await appMssql.exec(queryText)
        if (execResult.state === 'no') return 0

        if (execResult.error) {
            this.error('log', `error on save digest to MSSQL (it will be lost)- ${execResult.error}`)
        }
        list.forEach(item => item.stateMssql = 'done')
    }
}

