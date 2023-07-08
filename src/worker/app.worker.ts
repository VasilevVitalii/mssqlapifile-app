import { workerData, parentPort } from 'worker_threads'
import { Setting } from '../core/setting'
import { Logger } from '../core/logger'
import { TWElogDebug, TWElogDigest, TWElogError, TWElogTrace, TWEsetting } from '../exchange'

export type TWorkerDataApp = {currentPath: string}
export type TMessageImportApp = TWElogError | TWElogTrace | TWElogDebug | TWElogDigest
export type TMessageExportApp = TWEsetting | TWElogError

const env = {
    workerData: workerData as TWorkerDataApp,
    setting: new Setting((workerData as TWorkerDataApp).currentPath),
    logger: new Logger((workerData as TWorkerDataApp).currentPath),
}

env.logger.logTrace('app', 'worker started')

env.setting.eventOnRead((setting, messages, error) => {
    if (error) {
        env.logger.logError('app', error)
    }
    if (messages?.length > 0) {
        messages.forEach(item => env.logger.logDebug('app', item))
    }
    if (!setting) return

    env.logger.restart(setting.log.logLifeDays, setting.log.logAllowTrace)
    parentPort.postMessage({kind: 'setting', setting} as TMessageExportApp)
})

env.logger.eventOnMssql(list => {
    parentPort.postMessage(list as TMessageExportApp[])
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
        env.logger.logDigest(command.countSuccess, command.countError)
    } else {
        env.logger.logError('app', `internal error - unknown command kind "${unknownCommand}"`)
    }
})