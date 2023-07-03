import path from 'path'
import { Logger } from './logger'
import { Mssql } from './mssql'
import { Options, TOptions } from './options'
import { Loader } from './loader'

export const appOptions = new Options()
export const appLogger = new Logger()
export const appMssql = new Mssql()
export const appLoader = new Loader()

export async function Go(currentPath: string) {
    appLogger.debug('app', 'start mssqlapifile-app')
    appLogger.setLogDir(path.join(currentPath, 'log'))
    appOptions.setCurrentPath(currentPath)
    appOptions.onChange(onChangeOptions)
}

function onChangeOptions(options: TOptions) {

    appLogger.debug('app', 'load setting')

    appLogger.setLoglifeDays(options.log.lifeDays)
    appLogger.setAllowTrace(options.log.allowTrace)
    appLogger.setQueryLoadErrors(options.mssql.queryLoadErrors.join(`\n`))
    appLogger.setQueryLoadDigest(options.mssql.queryLoadDigest.join(`\n`))
    appLogger.init()

    appMssql.instance = options.mssql.connection.instance
    appMssql.login = options.mssql.connection.login
    appMssql.password = options.mssql.connection.password
    appMssql.init()

    appLoader.scan = [...options.source.scan]
    appLoader.logSuccessPathDefault = options.source.logErrorPathDefault
    appLoader.logErrorPathDefault = options.source.logErrorPathDefault
    appLoader.maxThreads = options.mssql.maxThreads
    appLoader.holdSec = options.mssql.holdSec
    appLoader.queryLoadDefault = options.mssql.queryLoadDefault.join(`\n`)
}

//TODO pause param
//TODO restart
//TODO convert XLSX
//TODO digest param (minutes)