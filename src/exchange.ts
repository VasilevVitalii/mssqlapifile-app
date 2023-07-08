import { TSetting, TSettingModeLoad, TSettingScan } from "./core/setting"

export type TFileStat = {
    size: number,
    mtime: number,
    btime: number
}

export type TWEfileStamp = {
    path: string,
    file: string,
    movePathSuccess: string,
    movePathError: string,
    queryLoad: string,
    modeLoad: TSettingModeLoad
}

export type TWElogTrace = {kind: 'log.trace', subsystem: string, text: string}
export type TWElogDebug = {kind: 'log.debug', subsystem: string, text: string}
export type TWElogError = {kind: 'log.error', subsystem: string, text: string}
export type TWElogDigest = {kind: 'log.digest', countSuccess: number, countError: number}
export type TWEsetting = {kind: 'setting', setting: TSetting}
export type TWEfileLoad = {kind: 'file.load', stamp: TWEfileStamp, stat: TFileStat}
export type TWEfileMove = {kind: 'file.move', path: string, file: string, pathDestination: string}
export type TWEfileCreate = {kind: 'file.create', text: string, file: string, pathDestination: string}
export type TWEfileForget = {kind: 'file.forget', path: string, file: string}



