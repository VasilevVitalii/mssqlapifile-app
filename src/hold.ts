import { appLoader, appLogger } from "./app"

/* eslint-disable @typescript-eslint/naming-convention */
export class Hold {

    private _hold = false
    private _prevHold = false

    constructor() {

    }

    getHold(): boolean {
        return this._hold
    }

    setHold(hold: boolean) {
        if (this._hold === hold) return

        this._prevHold = this._hold
        this._hold = hold
        if (this._prevHold === false && this._hold === true) {
            appLogger.debug('app', 'service prepare to hold state')
            this._onHold()
        } else if (this._prevHold === true && this._hold === false) {
            appLogger.debug('app', 'service in unhold state')
        }
    }

    private _onHold() {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerHold = setTimeout(async function tick() {
            //appLoader.list.filter(f => f.state === '')

            timerHold = setTimeout(tick, 10000)
        }, 2000)
    }
}