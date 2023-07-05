import * as mssqldriver from 'mssqldriver'
import * as vv from 'vv-common'
import { appLogger } from './app'

export type TMssqlState = 'no' | 'ok' | 'fail' | 'lost'
export type TMssqlExecState = 'no' | 'ok' | 'error-connect' | 'error-exec'

export class Mssql {
    instance = undefined as string
    login = undefined as string
    password = undefined as string
    database = undefined as string

    private _connection = undefined as mssqldriver.TConnection
    private _driver = undefined as mssqldriver.IApp
    private _state = 'no' as TMssqlState
    private _failCount = 0
    private _unlostTime = undefined as Date
    constructor() {
        const self = this
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerUnlost = setTimeout(function tick() {
            if (self._state === 'lost' && !vv.isEmpty(self._unlostTime) && (new Date()) > self._unlostTime) {
                self._state = 'ok'
                self._unlostTime = undefined
                self._failCount = 0
            }
            timerUnlost = setTimeout(tick, 5000)
        }, 5000)
    }

    init() {
        let needRecreate = false

        if (this._connection === undefined) {
            this._connection = {
                authentication: 'sqlserver',
                instance: this.instance,
                login: this.login,
                password: this.password,
                additional: {
                    appName: 'mssqlapifile-app',
                    database: this.database
                }
            }
            needRecreate = true
        } else {
            if (this._connection.instance !== this.instance) {
                this._connection.instance = this.instance
                needRecreate = true
            }
            if (this._connection.additional.database !== this.database) {
                this._connection.additional.database = this.database
                needRecreate = true
            }
            if (this._connection.authentication === 'sqlserver' && this._connection.login !== this.login) {
                this._connection.login = this.login
                needRecreate = true
            }
            if (this._connection.authentication === 'sqlserver' && this._connection.password !== this.password) {
                this._connection.password = this.password
                needRecreate = true
            }
        }

        if (needRecreate) {
            if (this._state === 'lost') {
                appLogger.debug('sql', `connection changed, pause canceled`)
            }
            this._state = 'no'
            this._driver = mssqldriver.Create(this._connection)
            this._state = 'ok'
            this._unlostTime = undefined
            this._failCount = 0
        }
    }

    getState(): TMssqlState {
        return this._state
    }

    execCallback(query: string, callback: (state: TMssqlExecState, error: string, data: mssqldriver.TTable[]) => void) {
        if (this._state !== 'ok' && this._state !== 'fail' ) {
            callback('no', undefined, undefined)
            return
        }

        this._driver.exec(query, {receiveMessage: 'none', receiveTables: 'cumulative' }, (result => {
            if (result.kind !== 'finish') return
            let state = 'ok' as TMssqlExecState

            const err = result.finish.error as any
            if (err && err.point === 'CONNECT' && (err.code === 'ESOCKET' || err.code === 'ELOGIN')) {
                state = 'error-connect'
                this._state = 'fail'
                this._failCount++
                if (this._failCount > 20) {
                    this._state = 'lost'
                    this._unlostTime = vv.dateAdd(new Date(),'minute',10)
                    this._failCount = 0
                    appLogger.error('sql', `many failed attempts to connect to the server, pause for 10 minutes`)
                }
            } else {
                this._state = 'ok'
                this._unlostTime = undefined
                this._failCount = 0
            }
            if (err && state !== 'error-connect') {
                state = 'error-exec'
            }

            const error = result.finish.error ? result.finish.error.message || result.finish.error.name || 'UNKNOWN MSSQL ERROR' : undefined
            callback(state, error, result.finish.tables)
        }))
    }

    async exec(query: string): Promise<{ state: TMssqlExecState; error: string; data: mssqldriver.TTable[] }> {
        return await new Promise(resolve => {
            this.execCallback(query, (state, error, data) => {
                resolve({state, error, data})
            })
        })
    }
}