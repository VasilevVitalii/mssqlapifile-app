import * as vv from 'vv-common'

export class Timer {
    private _timer = undefined as NodeJS.Timeout
    private _onTick = undefined as () => void
    private _timeout = undefined as number

    constructor(timeout: number, onTick: () => void) {
        this._onTick = onTick
        this._timeout = vv.toIntPositive(timeout)
        if (!this._onTick || this._timeout < 0) return

        this._timer = setTimeout(async () => this._onTick(), this._timeout)
    }

    nextTick(timeout?: number) {
        const t = vv.toIntPositive(timeout)
        this._timer = setTimeout(this._onTick, t !== undefined && t >= 0 ? t : this._timeout)
    }

    destroy() {
        if (this._timer) {
            clearTimeout(this._timer)
            this._timer = undefined
        }
        if (this._onTick) {
            this._onTick = undefined
        }
        this._timeout = undefined
    }
}