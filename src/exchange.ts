import { THoldState } from "./core/hold"
import { TSetting, TSettingModeLoad } from "./core/setting"

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
export type TWElogErrorLoad = {kind: 'log.load.error', list: {subsystem: string, text: string}[]}
export type TWElogDigestLoad = {kind: 'log.load.digest', digest: {countSuccess: number, countError: number, countQueue: number}}
export type TWElogDigest = {kind: 'log.digest', countSuccess: number, countError: number, countQueue: number}
export type TWEsetting = {kind: 'setting', setting: TSetting}
export type TWEfileLoad = {kind: 'file.load', stamp: TWEfileStamp, stat: TFileStat}
export type TWEfileMove = {kind: 'file.move', path: string, file: string, pathDestination: string}
export type TWEfileLoadResult = {kind: 'file.result', path: string, file: string, result: 'error' | 'success'}
export type TWEfileCreate = {kind: 'file.create', text: string, file: string, pathDestination: string}
export type TWEfileForget = {kind: 'file.forget', path: string, file: string, beforeTime?: Date}
export type TWEhold = {kind: 'hold', state: THoldState}
export type TWEstop = {kind: 'stop'}



