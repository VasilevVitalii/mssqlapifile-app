import { workerData, parentPort } from 'worker_threads'
import { Setting } from './core/setting'
import * as metronom from 'vv-metronom'
import { Logger } from './core/logger'

export type TWorkerData = {
    currentPath: string
}

const env = {
    workerData: workerData as TWorkerData,
    setting: new Setting((workerData as TWorkerData).currentPath),
    logger: new Logger((workerData as TWorkerData).currentPath),
}

env.setting.eventOnRead((setting, messages, error) => {
    if (error) {
        env.logger.LogError('stg', error)
    }
    if (messages?.length > 0) {
        messages.forEach(item => env.logger.LogDebug('stg', item))
    }
    if (!setting) return

    env.logger.Restart(setting.log.logLifeDays, setting.log.logAllowTrace)
})



parentPort.on('message', (command: any) => {
    console.log(env)
    console.log(command)
})