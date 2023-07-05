import * as vv from 'vv-common'
export class Numerator {
    private _prefix = ''
    private _stamp = ''
    private _idx = 0

    constructor(prefix: string) {
        if (!vv.isEmpty(prefix)) {
            this._prefix = prefix
        }
    }

    getKey(): string {
        const stamp = vv.dateFormat(new Date(), 'yyyymmddhhmi')
        if (stamp !== this._stamp) {
            this._stamp = stamp
            this._idx = 0
        }
        this._idx++
        return `${this._prefix}:${this._stamp}:${this._idx}`
    }

}