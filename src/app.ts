//worker on logger and setting - 1 (app)
//worker on scan filesystem - 1
//worker on load filedata  - 4
//worker on load load to mssql - 4
import * as path from 'path'
import worker_threads from 'worker_threads'
import {TWorkerData as TWorkerDataApp} from './app.worker'

export async function Go(currentPath: string) {
    const worker = new worker_threads.Worker(path.join(__dirname, 'app.worker.js'), {
        workerData: {currentPath: currentPath} as TWorkerDataApp
    })

    worker.postMessage('hello')
}

// worker.removeAllListeners()
// worker.terminate()
// worker = null