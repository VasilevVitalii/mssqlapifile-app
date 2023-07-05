//import exceljs from 'exceljs'
import * as xlsx from 'xlsx'
import { json2xml } from 'xml-js'
import * as fs from 'fs'
import { Readable } from 'stream'
//import * as cpexcel from 'xlsx/dist/cpexcel.full.mjs'

xlsx.set_fs(fs)
xlsx.stream.set_readable(Readable)
//XLSX.set_cptable(cpexcel)

export async function Read(fullFileName: string, format: 'xml' | 'json'): Promise<string> {
    const workbook = await xlsx.readFile(fullFileName)
    const sheetNames = workbook.SheetNames
    if (sheetNames.length <= 0) return ''

    const workbookJson = JSON.stringify(sheetNames.map(m => { return xlsx.utils.sheet_to_json(workbook.Sheets[m], {
        raw: false,
        dateNF: "YYYYMMDD",
        defval: ""
    }) }), null, 4)

    return format === 'json' ? workbookJson : format === 'xml' ? json2xml(JSON.stringify(workbookJson), { compact: true, spaces: 4 }) : ''
}