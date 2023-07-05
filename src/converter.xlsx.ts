//import exceljs from 'exceljs'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import { Readable } from 'stream'
//import * as cpexcel from 'xlsx/dist/cpexcel.full.mjs'

XLSX.set_fs(fs)
XLSX.stream.set_readable(Readable)
//XLSX.set_cptable(cpexcel)

export async function Read(fullFileName: string, format: 'xml' | 'json'): Promise<string> {
    const workbook = await XLSX.readFile(fullFileName)
    const sheetNames = workbook.SheetNames
    if (sheetNames.length <= 0) return ""

    const workbookJson = sheetNames.map(m => { return XLSX.utils.sheet_to_json(workbook.Sheets[m], {
        raw: false,
        dateNF: "YYYYMMDD",
        defval: ""
    }) })

    //XLSX.utils.sheet_to_json(workbook.Sheets[sheetNames[0]], {raw})

    //const workbook = new exceljs.Workbook()
    //await workbook.xlsx.readFile(fullFileName)

    return ''
}