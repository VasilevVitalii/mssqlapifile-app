import path from 'path'
import fs from 'fs-extra'
import * as vv from 'vv-common'
import * as xlsx from 'xlsx'
import * as mssqldriver from 'mssqldriver'
import { XMLBuilder } from "fast-xml-parser"
import renameObjectKey from 'deep-rename-keys'
import { Readable } from 'stream'
import { workerData, parentPort } from 'worker_threads'
import { TSettingMssql } from '../core/setting'
import { TWEfileCreate, TWEfileForget, TWEfileLoad, TWEfileLoadResult, TWEfileMove, TWEhold, TWElogDebug, TWElogDigestLoad, TWElogError, TWElogErrorLoad, TWElogTrace, TWEsetting } from '../exchange'
import { Timer } from '../core/timer'
import { dateAdd } from 'vv-common'
import { THoldState } from '../core/hold'
import { TMssqlWorkerIdx } from '../app'

export type TWorkerDataSql = {currentPath: string, idx: TMssqlWorkerIdx}
export type TMessageImportSql = TWEfileLoad | TWElogErrorLoad | TWElogDigestLoad | TWEsetting | TWEhold
export type TMessageExportSql = TWElogTrace | TWElogDebug | TWElogError | TWEfileCreate | TWEfileMove | TWEfileForget | TWEfileLoadResult

type TLoadEntity = {
    command: TWEfileLoad | TWElogErrorLoad | TWElogDigestLoad
}

const env = {
    holdState: 'holdManual' as THoldState,
    workerData: workerData as TWorkerDataSql,
    settingMssql: undefined as TSettingMssql,
    list: [] as TLoadEntity[],
    driver: undefined as mssqldriver.IApp,
    timePauseAfter: undefined as Date,
    queryDigest: undefined as string,
    queryError: undefined as string
}

const xmlBuilder = new XMLBuilder({format: true, arrayNodeName: 'sheets'})

xlsx.set_fs(fs)
xlsx.stream.set_readable(Readable)

const QUERY_DATA = [
    "DECLARE @filePath NVARCHAR(MAX); SET @filePath = N'{filePath}'",
    "DECLARE @fileNameWithoutExt NVARCHAR(MAX); SET @fileNameWithoutExt = N'{fileNameWithoutExt}'",
    "DECLARE @fileExt NVARCHAR(MAX); SET @fileExt = N'{fileExt}'",
    "DECLARE @data {datatype}",
    "SET @data = {N}'{data}'"
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
            if (env.holdState !== '' && env.holdState !== 'stopPrepare') {
                sendResultFile(item.command.stamp.path, item.command.stamp.file, 'success')
                parentPort.postMessage({kind: 'file.forget', path: item.command.stamp.path, file: item.command.stamp.file} as TMessageExportSql)
                continue
            }

            const fullFileName = path.join(item.command.stamp.path, item.command.stamp.file)

            try {
                if (!await fs.exists(fullFileName)) continue
            } catch (error) {
                sendResultFile(item.command.stamp.path, item.command.stamp.file, 'error')
                onErrorFile(item.command, `error check exists file "${fullFileName}" - ${error}`)
                continue
            }

            const itemCallback = {... item} as TLoadEntity
            const command = {...itemCallback.command} as TWEfileLoad

            fs.stat(fullFileName, undefined, async (error, stat) => {
                if (!vv.isEmpty(error)) {
                    sendResultFile(command.stamp.path, command.stamp.file, 'error')
                    onErrorFile(command, `error check file "${fullFileName}" - ${error}`)
                    return
                }

                if (command.stat.size !== stat.size || command.stat.btime !== stat.birthtimeMs || command.stat.mtime !== stat.mtimeMs) {
                    sendResultFile(command.stamp.path, command.stamp.file, 'success')
                    parentPort.postMessage({kind: 'file.forget', path: command.stamp.path, file: command.stamp.file} as TMessageExportSql)
                    return
                }

                const p = path.parse(command.stamp.file)

                let query = QUERY_DATA.join(`\n`)
                .replaceAll('{filePath}', command.stamp.path.replaceAll(`'`, `''`))
                .replaceAll('{fileNameWithoutExt}', p.name.replaceAll(`'`, `''`))
                .replaceAll('{fileExt}', p.ext.replaceAll(`'`, `''`))

                try {
                    if (command.stamp.modeLoad === 'fullFileName') {
                        query = query
                            .replaceAll('{datatype}', 'NVARCHAR(1)')
                            .replaceAll('{data}', '').replaceAll('{N}','')
                    } else if (command.stamp.modeLoad === 'bodyAsUtf8') {
                        const data = await fs.readFile(fullFileName,'utf8')
                        query = query
                        .replaceAll('{datatype}', 'NVARCHAR(MAX)')
                        .replaceAll('{data}', data?.replaceAll(`'`, `''`)).replaceAll('{N}','N')
                    } else if (command.stamp.modeLoad === 'bodyAsBase64') {
                        const data = await fs.readFile(fullFileName,'base64')
                        query = query
                        .replaceAll('{datatype}', 'NVARCHAR(MAX)')
                        .replaceAll('{data}', data?.replaceAll(`'`, `''`)).replaceAll('{N}','N')
                    } else if (command.stamp.modeLoad === 'bodyAsBinary') {
                        const data = (await fs.readFile(fullFileName)).toString('hex')
                        query = query
                        .replaceAll('{datatype}', 'VARBINARY(MAX)')
                        .replaceAll('{data}', data?.replaceAll(`'`, `''`)).replaceAll('{N}','')
                    } else if (command.stamp.modeLoad === 'xlsx2json' || command.stamp.modeLoad === 'xlsx2xml') {
                        const workbook = xlsx.readFile(fullFileName, {dense: true})
                        const sheetNames = workbook.SheetNames
                        const workbookJsonStr = sheetNames.length > 0 ?
                            JSON.stringify(sheetNames.map(m => {
                                return xlsx.utils.sheet_to_json(workbook.Sheets[m], {
                                    header: "A",
                                    raw: false,
                                    dateNF: "YYYYMMDD",
                                    defval: "",
                                    rawNumbers: true,
                                    skipHidden: true,
                                    blankrows: false,
                                })
                            }), null, 4) : ''
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

                        const data = command.stamp.modeLoad === 'xlsx2xml' ?
                            xmlBuilder.build(workbookJsonRenamed) :
                            JSON.stringify(workbookJsonRenamed, null, 4)
                        query = query
                            .replaceAll('{datatype}', 'NVARCHAR(MAX)')
                            .replaceAll('{data}', data?.replaceAll(`'`, `''`)).replaceAll('{N}','N')
                    } else if (command.stamp.modeLoad === 'xml2xml') {
                        let data = (await fs.readFile(fullFileName)).toString('utf8')
                        const fndHead1 = data.indexOf('<?xml')
                        if (fndHead1 >= 0) {
                            const fndHead2 = data.indexOf('?>', fndHead1)
                            if (fndHead2 >= 0) {
                                data = data.substring(0, fndHead1) + data.substring(fndHead2 + 2)
                            }
                        }
                        query = query
                            .replaceAll('{datatype}', 'XML')
                            .replaceAll('{data}', data?.replaceAll(`'`, `''`)).replaceAll('{N}','N')
                    } else {
                        throw new Error(`in setting unknown scan.modeLoad = "${command.stamp.modeLoad}"`)
                    }
                } catch (error) {
                    sendResultFile(command.stamp.path, command.stamp.file, 'error')
                    onErrorFile(command, `error load file "${path.join(fullFileName)}" - ${error}`)
                    return
                }

                parentPort.postMessage({kind: 'log.trace', subsystem: 'sql', text: `[${env.workerData.idx}] begin load file "${path.join(command.stamp.path, command.stamp.file)}"`} as TMessageExportSql)

                query = `${query}\n${command.stamp.queryLoad}`
                env.driver.exec(query, {receiveMessage: 'none', receiveTables: 'cumulative'}, callback => {
                    if (callback.kind !== 'finish') return
                    parentPort.postMessage({kind: 'log.trace', subsystem: 'sql', text: `[${env.workerData.idx}] end load file "${path.join(command.stamp.path, command.stamp.file)}"`} as TMessageExportSql)
                    const err = typeSqlError(callback.finish.error)
                    if (err === 'none') {
                        const lastRow = callback.finish.tables.at(-1)?.rows.at(-1)
                        const holdsec = vv.isEmpty(lastRow) ? undefined : vv.toIntPositive(lastRow['holdsec'])
                        const beforeTime = holdsec !== undefined && holdsec > 0 ? vv.dateAdd(new Date(), 'second', holdsec) : undefined
                        sendResultFile(command.stamp.path, command.stamp.file, 'success')
                        if (beforeTime === undefined) {
                            parentPort.postMessage({kind: 'file.move', path: command.stamp.path, file: command.stamp.file, pathDestination: command.stamp.movePathSuccess} as TMessageExportSql)
                        } else {
                            parentPort.postMessage({kind: 'file.forget', path: command.stamp.path, file: command.stamp.file, beforeTime: beforeTime} as TMessageExportSql)
                        }
                    } else if (err === 'connect') {
                        onErrorConnect(itemCallback, callback.finish.error)
                    } else if (err === 'exec') {
                        sendResultFile(command.stamp.path, command.stamp.file, 'error')
                        onErrorFile(command, `error load file "${path.join(command.stamp.path, command.stamp.file)}" - "${callback.finish.error.message}"`, query)
                    }
                })
            })
        } else if (item.command.kind === 'log.load.digest') {
            if (vv.isEmpty(env.queryDigest)) {
                continue
            }

            const query = QUERY_DIGEST.join(`\n`)
                .replaceAll('{countSuccess}', vv.toString(item.command.digest.countSuccess))
                .replaceAll('{countError}', vv.toString(item.command.digest.countError))
                .replaceAll('{countQueue}', vv.toString(item.command.digest.countQueue))
            + `\n` + env.queryDigest

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
            if (vv.isEmpty(env.queryError)) {
                continue
            }

            const query = QUERY_ERROR.join(`\n`) + `\n` +
                item.command.list.map(m => { return `SELECT '[${m.subsystem}] ${m.text.replaceAll(`'`, `''`)}'`}).join(`UNION ALL\n`) + `\n` +
                env.queryError

            const itemCallback = {...item}

            env.driver.exec(query, {receiveMessage: 'none', receiveTables: 'cumulative'}, callback => {
                if (callback.kind !== 'finish') return
                const err = typeSqlError(callback.finish.error)
                if (err === 'connect') {
                    onErrorConnect(itemCallback, callback.finish.error)
                } else if (err === 'exec') {
                    parentPort.postMessage({kind: 'log.error', subsystem: 'sql', text: `error in load error - "${callback.finish.error.message}", query:\n${query}`} as TMessageExportSql)
                }
            })
        }
    }
    timerProcess.nextTick(100)
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

function onErrorFile(item: TWEfileLoad, error: string, query?: string) {
    parentPort.postMessage({kind: 'log.error', subsystem: 'sql', text: error} as TMessageExportSql)
    if (item.stamp.movePathError) {
        const text = [
            '/*',
            error,
            '*/',
            vv.isEmpty(query) ? '' : query
        ].join('\n')
        parentPort.postMessage({kind: 'file.create', text: text, file: `${item.stamp.file}.mssqlapifile-ticket.txt`, pathDestination: item.stamp.movePathError} as TMessageExportSql)
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
        if (vv.isEmpty(command.setting?.mssql) || JSON.stringify(command.setting.mssql) === JSON.stringify(env.settingMssql)) return

        parentPort.postMessage({kind: 'log.debug', subsystem: 'sql', text: `[${env.workerData.idx}] get new version setting`} as TMessageExportSql)
        env.settingMssql = command.setting?.mssql

        env.driver = mssqldriver.Create({
            authentication: 'sqlserver',
            instance: env.settingMssql.connection.instance,
            login: env.settingMssql.connection.login,
            password: env.settingMssql.connection.password,
            additional: {
                appName: 'mssqlapifile-app',
                database: env.settingMssql.connection.database
            }
        })

        const queryDigest = (env.settingMssql.queries.find(f => f.key === env.settingMssql.queryLoadDigestKey)?.query || []).join(`\n`)
        if (vv.isEmpty(queryDigest)) {
            parentPort.postMessage({kind: 'log.debug', subsystem: 'sql', text: `[${env.workerData.idx}] query for save digest not found`} as TMessageExportSql)
        } else {
            env.queryDigest = queryDigest
        }
        const queryError = (env.settingMssql.queries.find(f => f.key === env.settingMssql.queryLoadErrorKey)?.query || []).join(`\n`)
        if (vv.isEmpty(queryError)) {
            parentPort.postMessage({kind: 'log.debug', subsystem: 'sql', text: `[${env.workerData.idx}] query for save error not found`} as TMessageExportSql)
        } else {
            env.queryError = queryError
        }

    } else if (command.kind === 'file.load' || command.kind === 'log.load.digest' || command.kind === 'log.load.error') {
        env.list.push({
            command: command
        })
    } else if (command.kind === 'hold') {
        if (command.state === '') {
            parentPort.postMessage({kind: 'log.debug', subsystem: 'sql', text: `[${env.workerData.idx}] worker started`} as TMessageExportSql)
        } else if (command.state !== 'stop')  {
            parentPort.postMessage({kind: 'log.debug', subsystem: 'sql', text: `[${env.workerData.idx}] worker on pause (setting ... ${command.state})`} as TMessageExportSql)
        }
        env.holdState = command.state
    } else {
        parentPort.postMessage({kind: 'log.error', subsystem: 'sql', text: `internal error - unknown command kind "${unknownCommand}"`} as TMessageExportSql)
    }
})