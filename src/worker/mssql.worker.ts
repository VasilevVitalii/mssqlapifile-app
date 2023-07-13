import path from 'path'
import fs from 'fs-extra'
import * as vv from 'vv-common'
import * as xlsx from 'xlsx'
import * as mssqldriver from 'mssqldriver'
import { XMLBuilder } from "fast-xml-parser"
import renameObjectKey from 'deep-rename-keys'
import { Readable } from 'stream'
import { workerData, parentPort } from 'worker_threads'
import { TSetting } from '../core/setting'
import { TWEfileCreate, TWEfileForget, TWEfileLoad, TWEfileLoadResult, TWEfileMove, TWEhold, TWElogDebug, TWElogDigestLoad, TWElogError, TWElogErrorLoad, TWElogTrace, TWEsetting } from '../exchange'
import { Timer } from '../core/timer'
import { dateAdd } from 'vv-common'

export type TWorkerDataSql = {currentPath: string, setting: TSetting, idx: number}
export type TMessageImportSql = TWEfileLoad | TWElogErrorLoad | TWElogDigestLoad | TWEsetting | TWEhold
export type TMessageExportSql = TWElogTrace | TWElogDebug | TWElogError | TWEfileCreate | TWEfileMove | TWEfileForget | TWEfileLoadResult

type TLoadEntity = {
    command: TWEfileLoad | TWElogErrorLoad | TWElogDigestLoad
}

const env = {
    workerData: workerData as TWorkerDataSql,
    setting: undefined as TSetting,
    list: [] as TLoadEntity[],
    driver: undefined as mssqldriver.IApp,
    timePauseAfter: undefined as Date
}

const xmlBuilder = new XMLBuilder({format: true, arrayNodeName: 'sheets'})

xlsx.set_fs(fs)
xlsx.stream.set_readable(Readable)

parentPort.postMessage({kind: 'log.trace', subsystem: 'sql', text: `worker #${env.workerData.idx} started`} as TMessageExportSql)

const QUERY_DATA = [
    "DECLARE @filePath NVARCHAR(MAX); SET @filePath = '{filePath}'",
    "DECLARE @fileNameWithoutExt NVARCHAR(MAX); SET @fileNameWithoutExt = '{fileNameWithoutExt}'",
    "DECLARE @fileExt NVARCHAR(MAX); SET @fileExt = '{fileExt}'",
    "DECLARE @data {datatype}",
    "SET @data = '{data}'"
]

const QUERY_DIGEST = [
    "DECLARE @countSuccess INT; SET @countSuccess = {countSuccess}",
    "DECLARE @countError INT; SET @countError = {countError}",
    "DECLARE @countQueue INT; SET @countQueue = {countQueue}"
]

const QUERY_ERROR = [
    `IF OBJECT_ID('tempdb..#mssqlapifile_app_errors') IS NOT NULL DROP TABLE #mssqlapifile_app_errors`,
    `CREATE TABLE #mssqlapifile_app_errors([id] INT IDENTITY(1,1), [message] NVARCHAR(MAX))`,
    `INSERT INTO #mssqlapifile_app_errors([message])`
]

const BOUNDARY = [`\u000A`,`\u0009`,`\u0020`,`\u00A0`,`\u1680`,`\u2000`,`\u2001`,`\u2002`,`\u2003`,`\u2004`,`\u2005`,`\u2006`,`\u2007`,`\u2008`,`\u2009`,`\u200A`,`\u202F`,`\u205F`,`\u3000`]

const timerProcess = new Timer(5000, async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const item = getLoadFile()
        if (vv.isEmpty(item)) {
            break
        }

        if (item.command.kind === 'file.load') {
            const fullFileName = path.join(item.command.stamp.path, item.command.stamp.file)

            try {
                if (!await fs.exists(fullFileName)) continue
            } catch (error) {
                sendResultFile(item.command.stamp.path, item.command.stamp.file, 'error')
                onErrorFile(item.command, `error check exists file "${fullFileName}" - ${error}`)
                continue
            }

            let stat = undefined as fs.Stats
            try {
                stat = await fs.stat(fullFileName)
            } catch (error) {
                sendResultFile(item.command.stamp.path, item.command.stamp.file, 'error')
                onErrorFile(item.command, `error check file "${fullFileName}" - ${error}`)
                continue
            }

            if (item.command.stat.size !== stat.size || item.command.stat.btime !== stat.birthtimeMs || item.command.stat.mtime !== stat.mtimeMs) {
                sendResultFile(item.command.stamp.path, item.command.stamp.file, 'success')
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
                    const workbookJsonStr = sheetNames.length > 0 ?
                        JSON.stringify(sheetNames.map(m => { return xlsx.utils.sheet_to_json(workbook.Sheets[m], {raw: false, dateNF: "YYYYMMDD", defval: "", rawNumbers: true, skipHidden: true}) }), null, 4) : ''
                    const workbookJsonRaw = JSON.parse(workbookJsonStr)
                    let workbookJson = {}
                    if (Array.isArray(workbookJsonRaw)) {
                        workbookJsonRaw.forEach((item, itemIdx) => {
                            if (Array.isArray(item)) {
                                const sheet = {item: [...item]}
                                workbookJson[`sheet${itemIdx}`] = sheet
                            } else {
                                workbookJson[`object${itemIdx}`] = item
                            }
                        })
                    } else {
                        workbookJson = workbookJsonRaw
                    }

                    const workbookJsonRenamed = renameObjectKey(workbookJson, key => {
                        const maybeInt = vv.toInt(key)?.toString()
                        if (maybeInt === key) {
                            return `item${key}`
                        }
                        let newKey = key
                        BOUNDARY.forEach(item => {
                            newKey = newKey.replace(item, '_')
                        })
                        return newKey
                    })
                    //fs.writeFileSync(path.join(item.command.stamp.path, '1.json'), JSON.stringify(workbookJsonRenamed, null, 4), 'utf-8')
                    //fs.writeFileSync(path.join(item.command.stamp.path, '1.xml'), xmlBuilder.build(workbookJsonRenamed), 'utf-8')
                    const data = item.command.stamp.modeLoad === 'xlsx2xml' ?  xmlBuilder.build(workbookJsonRenamed) : JSON.stringify(workbookJsonRenamed, null, 4)
                    query = query
                        .replaceAll('{datatype}', 'NVARCHAR(MAX)')
                        .replaceAll('{data}', data?.replace(`'`, `''`))
                } else {
                    throw new Error(`in setting unknown scan.modeLoad = "${item.command.stamp.modeLoad}"`)
                }
            } catch (error) {
                sendResultFile(item.command.stamp.path, item.command.stamp.file, 'error')
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
                    sendResultFile(command.stamp.path, command.stamp.file, 'success')
                    parentPort.postMessage({kind: 'file.move', path: command.stamp.path, file: command.stamp.file, pathDestination: command.stamp.movePathSuccess} as TMessageExportSql)
                } else if (err === 'connect') {
                    onErrorConnect(itemCallback, callback.finish.error)
                } else if (err === 'exec') {
                    sendResultFile(command.stamp.path, command.stamp.file, 'error')
                    onErrorFile(command, [`/*`,callback.finish.error.message,`*/`,'\n',query].join(`\n`))
                }
            })
        } else if (item.command.kind === 'log.load.digest') {
            const queryDigest = env.setting.mssql.queries.find(f => f.key === env.setting.mssql.queryLoadDigestKey).query
            if (vv.isEmpty(queryDigest)) {
                continue
            }

            const query = QUERY_DIGEST.join(`\n`)
                .replaceAll('{countSuccess}', vv.toString(item.command.digest.countSuccess))
                .replaceAll('{countError}', vv.toString(item.command.digest.countError))
                .replaceAll('{countQueue}', vv.toString(item.command.digest.countQueue))
            + `\n` + queryDigest.join('\n')

            const itemCallback = {...item}

            env.driver.exec(query, {receiveMessage: 'none', receiveTables: 'cumulative'}, callback => {
                if (callback.kind !== 'finish') return
                const err = typeSqlError(callback.finish.error)
                if (err === 'connect') {
                    onErrorConnect(itemCallback, callback.finish.error)
                } else if (err === 'exec') {
                    parentPort.postMessage({kind: 'log.error', subsystem: 'sql', text: `in load digest error - ${callback.finish.error.message}`} as TMessageExportSql)
                }
            })

        } else if (item.command.kind === 'log.load.error') {

            const queryError = env.setting.mssql.queries.find(f => f.key === env.setting.mssql.queryLoadErrorKey).query
            if (vv.isEmpty(queryError)) {
                continue
            }

            const query = QUERY_ERROR.join(`\n`) + `\n` +
                item.command.list.map(m => { return `SELECT '[${m.subsystem}] ${m.text.replace(`'`, `''`)}'`}).join(`UNION ALL\n`) + `\n` +
                queryError.join(`\n`)

            const itemCallback = {...item}

            env.driver.exec(query, {receiveMessage: 'none', receiveTables: 'cumulative'}, callback => {
                if (callback.kind !== 'finish') return
                const err = typeSqlError(callback.finish.error)
                if (err === 'connect') {
                    onErrorConnect(itemCallback, callback.finish.error)
                } else if (err === 'exec') {
                    parentPort.postMessage({kind: 'log.error', subsystem: 'sql', text: `error in load error - ${callback.finish.error.message}`} as TMessageExportSql)
                }
            })
        }
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

function sendResultFile(path: string, file: string, result: 'error' | 'success') {
    parentPort.postMessage({kind: 'file.result', path: path, file: file, result: result} as TWEfileLoadResult)
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
    } else if (command.kind === 'file.load' || command.kind === 'log.load.digest' || command.kind === 'log.load.error') {
        env.list.push({
            command: command
        })
    } else {
        parentPort.postMessage({kind: 'log.error', subsystem: 'sql', text: `internal error - unknown command kind "${unknownCommand}"`} as TMessageExportSql)
    }
})