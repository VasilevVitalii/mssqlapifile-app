import * as app from '../src/app'
import path from 'path'
import fs from 'fs-extra'
const currentPath = path.join(__dirname, '..', '..', 'test')

type TCommand = 'fill' | 'start' | 'fill&start'
const command = 'start' as TCommand

if (command === 'fill' || command === 'fill&start') {
    fs.emptyDirSync(path.join(currentPath, 'scan'))
    fs.emptyDirSync(path.join(currentPath, 'log'))
    fs.readdirSync(path.join(currentPath, 'testfiles')).forEach(f => {
        const p = path.parse(f)
        for (let i = 0; i < 1000; i++) {
            fs.ensureDirSync(path.join(currentPath, 'scan', 'folder1'))
            fs.copyFileSync(path.join(currentPath, 'testfiles', f), path.join(currentPath, 'scan', 'folder1', `${i}${p.ext}`))
        }
    })
}

if (command === 'fill&start' || command === 'start') {
    app.Go(currentPath)
}