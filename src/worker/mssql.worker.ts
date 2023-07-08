import path from 'path'
import fs from 'fs-extra'
import * as vv from 'vv-common'
import * as xlsx from 'xlsx'
import * as mssqldriver from 'mssqldriver'
import { json2xml } from 'xml-js'
import { Readable } from 'stream'
import { workerData, parentPort } from 'worker_threads'
import { TSetting } from '../core/setting'
import { TWEfileCreate, TWEfileForget, TWEfileLoad, TWEfileMove, TWElogDebug, TWElogDigest, TWElogError, TWElogTrace, TWEsetting } from '../exchange'
import { Timer } from '../core/timer'
import { dateAdd } from 'vv-common'

export type TWorkerDataSql = {currentPath: string, setting: TSetting, idx: number}
export type TMessageImportSql = TWEfileLoad | TWElogError | TWElogDigest | TWEsetting
export type TMessageExportSql = TWElogTrace | TWElogDebug | TWElogError | TWEfileCreate | TWEfileMove | TWEfileForget

type TLoadEntity = {
    command: TWEfileLoad | TWElogDigest | TWElogError
}

const env = {
    workerData: workerData as TWorkerDataSql,
    setting: undefined as TSetting,
    list: [] as TLoadEntity[],
    driver: undefined as mssqldriver.IApp,
    timePauseAfter: undefined as Date
}

xlsx.set_fs(fs)
xlsx.stream.set_readable(Readable)

parentPort.postMessage({kind: 'log.trace', subsystem: 'sql', text: `worker #${env.workerData.idx} started`} as TMessageExportSql)

const QUERY_DATA = [
    "DECLARE @filePath NVARCHAR(MAX), @fileNameWithoutExt NVARCHAR(MAX), @fileExt NVARCHAR(MAX), @data {datatype}",
    "SET @filePath = '{filePath}'; SET @fileNameWithoutExt = '{fileNameWithoutExt}'; SET @fileExt = '{fileExt}'",
    "SET @data = '{data}'"
]

const timerProcess = new Timer(5000, async () => {
    let item = getLoadFile()

    while (item) {
        if (item.command.kind === 'file.load') {
            const fullFileName = path.join(item.command.stamp.path, item.command.stamp.file)
            let stat = undefined as fs.Stats
            try {
                stat = await fs.stat(fullFileName)
            } catch (error) {
                onErrorFile(item.command, `error check file "${fullFileName}" - ${error}`)
                continue
            }

            if (item.command.stat.size !== stat.size || item.command.stat.btime !== stat.birthtimeMs || item.command.stat.mtime !== stat.mtimeMs) {
                parentPort.postMessage({kind: 'file.forget', path: item.command.stamp.path, file: item.command.stamp.file} as TMessageExportSql)
                continue
            }

            const p = path.parse(item.command.stamp.file)

            let query = QUERY_DATA.join(`\n`)
                .replaceAll('{filePath}', item.command.stamp.path.replaceAll(`'`, `''`))
                .replaceAll('{fileNameWithoutExt}', p.name.replaceAll(`'`, `''`))
                .replaceAll('{fileExt}', p.ext.replaceAll(`'`, `''`))

            try {
                if (item.command.stamp.modeLoad === 'fullFileName') {
                    query = query
                        .replaceAll('{datatype}', 'NVARCHAR(1)')
                        .replaceAll('{data}', '')
                } else if (item.command.stamp.modeLoad === 'bodyAsUtf8') {
                    const data = await fs.readFile(fullFileName,'utf8')
                    query = query
                    .replaceAll('{datatype}', 'NVARCHAR(MAX)')
                    .replaceAll('{data}', data?.replace(`'`, `''`))
                } else if (item.command.stamp.modeLoad === 'bodyAsBase64') {
                    const data = await fs.readFile(fullFileName,'base64')
                    query = query
                    .replaceAll('{datatype}', 'NVARCHAR(MAX)')
                    .replaceAll('{data}', data?.replace(`'`, `''`))
                } else if (item.command.stamp.modeLoad === 'bodyAsBinary') {
                    const data = (await fs.readFile(fullFileName)).toString('hex')
                    query = query
                    .replaceAll('{datatype}', 'VARBINARY(MAX)')
                    .replaceAll('{data}', data?.replace(`'`, `''`))
                } else if (item.command.stamp.modeLoad === 'xlsx2json' || item.command.stamp.modeLoad === 'xlsx2xml') {
                    const workbook = xlsx.readFile(fullFileName)
                    const sheetNames = workbook.SheetNames
                    const workbookJson = sheetNames.length > 0 ?
                        JSON.stringify(sheetNames.map(m => { return xlsx.utils.sheet_to_json(workbook.Sheets[m], {raw: false, dateNF: "YYYYMMDD", defval: ""}) }), null, 4) : {}
                    const data = item.command.stamp.modeLoad === 'xlsx2xml' ? json2xml(JSON.stringify(workbookJson), { compact: true, spaces: 4 }) : JSON.stringify(workbookJson, null, 4)
                    query = query
                        .replaceAll('{datatype}', 'NVARCHAR(MAX)')
                        .replaceAll('{data}', data?.replace(`'`, `''`))
                } else {
                    throw new Error(`in setting unknown scan.modeLoad = "${item.command.stamp.modeLoad}"`)
                }
            } catch (error) {
                onErrorFile(item.command, `error load file "${path.join(fullFileName)}" - ${error}`)
                continue
            }

            const itemCallback = {...item}

            query = `${query}\n${item.command.stamp.queryLoad}`
            env.driver.exec(query, {receiveMessage: 'none', receiveTables: 'cumulative'}, callback => {
                if (callback.kind !== 'finish') return
                const command = itemCallback.command as TWEfileLoad
                const err = typeSqlError(callback.finish.error)
                if (err === 'none') {
                    parentPort.postMessage({kind: 'file.move', path: command.stamp.path, file: command.stamp.file, pathDestination: command.stamp.movePathSuccess} as TMessageExportSql)
                } else if (err === 'connect') {
                    onErrorConnect(itemCallback, callback.finish.error)
                } else if (err === 'exec') {
                    onErrorFile(command, [`/*`,callback.finish.error,`*/`,'\n',query].join(`\n`))
                }
            })
        } else if (item.command.kind === 'log.digest') {
            parentPort.postMessage({kind: 'log.error', subsystem: 'sql', text: `log.digest not implemented`} as TMessageExportSql)
        } else if (item.command.kind === 'log.error') {
            parentPort.postMessage({kind: 'log.error', subsystem: 'sql', text: `log.error not implemented`} as TMessageExportSql)
        }

        item = getLoadFile()
    }
    timerProcess.nextTick(1000)
})

function getLoadFile(): TLoadEntity {
    if (!vv.isEmpty(env.timePauseAfter)) {
        const now = new Date()
        if (env.timePauseAfter > now) {
            return undefined
        } else {
            env.timePauseAfter = undefined
        }
    }
    const item = env.list.shift()
    return item ? {...item} : undefined
}

function typeSqlError(error: any): 'none' | 'connect' | 'exec' {
    if (vv.isEmpty(error)) {
        return 'none'
    }
    if (error.point === 'CONNECT' && (error.code === 'ESOCKET' || error.code === 'ELOGIN')) {
        return 'connect'
    }
    return 'exec'
}

function onErrorFile(item: TWEfileLoad, error: string) {
    parentPort.postMessage({kind: 'log.error', subsystem: 'sql', text: error} as TMessageExportSql)
    if (item.stamp.movePathError) {
        parentPort.postMessage({kind: 'file.create', text: error, file: `${item.stamp.file}.mssqlapifile-ticket.txt`, pathDestination: item.stamp.movePathError} as TMessageExportSql)
    }
    parentPort.postMessage({kind: 'file.move', path: item.stamp.path, file: item.stamp.file, pathDestination: item.stamp.movePathError} as TMessageExportSql)
}

function onErrorConnect(item: TLoadEntity, error: Error) {
    parentPort.postMessage({kind: 'log.error', subsystem: 'sql', text: `in worker ${env.workerData.idx} error connect to sql - ${error}`} as TMessageExportSql)
    env.timePauseAfter = dateAdd(new Date(), 'minute', 2)
    env.list.unshift(item)
}

parentPort.on('message', (command: TMessageImportSql) => {
    const unknownCommand = command.kind as string
    if (command.kind === 'setting') {
        env.setting = command.setting
        env.driver = mssqldriver.Create({
            authentication: 'sqlserver',
            instance: env.setting.mssql.connection.instance,
            login: env.setting.mssql.connection.login,
            password: env.setting.mssql.connection.password,
            additional: {
                appName: 'mssqlapifile-app',
                database: env.setting.mssql.connection.database
            }
        })
    } else if (command.kind === 'file.load') {
        env.list.push({
            command: command
        })
    } else if (command.kind === 'log.digest') {
        //TODO create
    } else if (command.kind === 'log.error') {
        //TODO create
    } else {
        parentPort.postMessage({kind: 'log.error', subsystem: 'sql', text: `internal error - unknown command kind "${unknownCommand}"`} as TMessageExportSql)
    }
})