/* eslint-disable @typescript-eslint/naming-convention */
import { workerData, parentPort } from 'worker_threads'
import { Setting } from '../core/setting'
import { Logger } from '../core/logger'
import { TWEhold, TWElogDebug, TWElogDigest, TWElogDigestLoad, TWElogError, TWElogErrorLoad, TWElogTrace, TWEsetting, TWEstop } from '../exchange'
import { THoldState } from '../core/hold'

export type TWorkerDataApp = {currentPath: string}
export type TMessageImportApp = TWElogError | TWElogTrace | TWElogDebug | TWElogDigest | TWEhold
export type TMessageExportApp = TWEsetting | TWElogErrorLoad | TWElogDigestLoad | TWEstop

const env = {
    holdState: 'holdManual' as THoldState,
    workerData: workerData as TWorkerDataApp,
    setting: new Setting((workerData as TWorkerDataApp).currentPath),
    logger: new Logger((workerData as TWorkerDataApp).currentPath),
}

env.setting.eventOnRead((setting, messages, error, fullFileName, existsFile) => {
    if (error) {
        env.logger.logError('app', error)
    }
    if (existsFile === false) {
        parentPort.postMessage({kind: 'stop'} as TMessageExportApp)
        return
    }
    if (messages?.length > 0) {
        messages.forEach(item => env.logger.logDebug('app', item))
    }
    if (!setting) return

    env.logger.restart(setting.log.logLifeDays, setting.log.logAllowTrace)
    parentPort.postMessage({kind: 'setting', setting} as TMessageExportApp)
})

env.logger.eventOnMssql(item => {
    parentPort.postMessage(item as TMessageExportApp)
})

parentPort.on('message', (command: TMessageImportApp) => {
    const unknownCommand = command.kind as string
    if (command.kind === 'log.trace') {
        env.logger.logTrace(command.subsystem, command.text)
    } else if (command.kind === 'log.debug') {
        env.logger.logDebug(command.subsystem, command.text)
    } else if (command.kind === 'log.error') {
        env.logger.logError(command.subsystem, command.text)
    } else if (command.kind === 'log.digest') {
        env.logger.logDigest(command.countSuccess, command.countError, command.countQueue)
    } else if (command.kind === 'hold') {
        env.holdState = command.state
        if (command.state === '') {
            env.logger.logDebug('app', `worker started`)
        } else {
            env.logger.logDebug('app', `worker on pause (setting ... ${command.state})`)
        }
        if (command.state === 'stop') {
            env.logger.stop()
        }
    } else {
        env.logger.logError('app', `internal error - unknown command kind "${unknownCommand}"`)
    }
})