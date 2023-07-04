import path from 'path'
import { Logger } from './logger'
import { Mssql } from './mssql'
import { Options, TOptions } from './options'
import { Loader } from './loader'
import { Hold } from './hold'

export const appOptions = new Options()
export const appLogger = new Logger()
export const appMssql = new Mssql()
export const appLoader = new Loader()
export const appHold = new Hold()

export async function Go(currentPath: string) {
    appLogger.debug('app', 'start mssqlapifile-app')
    appLogger.setLogPath(path.join(currentPath, 'log'))
    appOptions.setCurrentPath(currentPath)
    appOptions.onChange(onChangeOptions)
}

function onChangeOptions(options: TOptions) {

    appLogger.debug('app', 'load setting')

    appHold.setHoldManual(options.service.holdManual)
    appHold.weekSunday = options.service.holdAuto.weekSunday
    appHold.weekMonday = options.service.holdAuto.weekMonday
    appHold.weekTuesday = options.service.holdAuto.weekTuesday
    appHold.weekWednesday = options.service.holdAuto.weekWednesday
    appHold.weekThursday = options.service.holdAuto.weekThursday
    appHold.weekFriday = options.service.holdAuto.weekFriday
    appHold.weekSaturday = options.service.holdAuto.weekSaturday
    appHold.time = options.service.holdAuto.time
    appHold.initHoldAuto()

    appLogger.setLoglifeDays(options.log.lifeDays)
    appLogger.setAllowTrace(options.log.allowTrace)
    appLogger.queryLoadErrors = options.mssql.queryLoadErrors.join(`\n`)
    appLogger.queryLoadDigest = options.mssql.queryLoadDigest.join(`\n`)
    appLogger.init()

    appMssql.instance = options.mssql.connection.instance
    appMssql.login = options.mssql.connection.login
    appMssql.password = options.mssql.connection.password
    appMssql.database = options.mssql.connection.database
    appMssql.init()

    appLoader.scan = [...options.source.scan]
    appLoader.logSuccessPathDefault = options.source.logSuccessPathDefault
    appLoader.logErrorPathDefault = options.source.logErrorPathDefault
    appLoader.maxThreads = options.mssql.maxThreads
    appLoader.holdSec = options.mssql.holdSec
    appLoader.queryLoadDefault = options.mssql.queryLoadDefault.join(`\n`)
}

//TODO convert XLSX
//TODO error ticket