import * as vv from 'vv-common'
import { appLoader, appLogger } from "./app"
import * as metronom from 'vv-metronom'

/* eslint-disable @typescript-eslint/naming-convention */
export class Hold {

    private _holdManual = false
    private _holdAuto = false
    private _prevHoldManual = false
    private _metronom = undefined as metronom.Metronom
    private _cron = undefined as metronom.TMetronomCustom

    weekSunday = false
    weekMonday = false
    weekTuesday = false
    weekWednesday = false
    weekThursday = false
    weekFriday = false
    weekSaturday = false
    time = ""

    constructor() {

    }

    getHold(): boolean {
        return this._holdManual
    }

    setHoldManual(holdManual: boolean) {
        if (this._holdManual === holdManual) return

        this._prevHoldManual = this._holdManual
        this._holdManual = holdManual
        if (this._prevHoldManual === false && this._holdManual === true) {
            appLogger.debug('app', 'service prepare to hold state')
            this._onHold()
        } else if (this._prevHoldManual === true && this._holdManual === false) {
            appLogger.debug('app', 'service in unhold state')
        }
    }

    initHoldAuto() {
        const newCron = this._getCron()
        if (newCron !== this._cron) {
            if (this._metronom !== undefined) {
                this._metronom.stop()
                this._metronom = undefined
            }
            if (newCron !== undefined) {
                this._metronom = metronom.Create(newCron)
                this._metronom.onTick(() => {
                    this.setHoldManual(true)
                    this._holdAuto = true
                })
                this._metronom.start()
            }
            this._cron = newCron
        }
    }

    private _getCron(): metronom.TMetronomCustom {
        if (this.time.length !== 5) return undefined
        const hour = vv.toIntPositive(this.time.substring(0, 2))
        const min = vv.toIntPositive(this.time.substring(3, 5))
        if (hour === undefined || hour > 23) return undefined
        if (min === undefined || min > 59) return undefined
        if (!this.weekSunday && !this.weekMonday && !this.weekTuesday && !this.weekWednesday && !this.weekThursday && !this.weekFriday && !this.weekSaturday) return undefined
        return {
            kind: 'custom',
            periodicity: 'once',
            weekdaySun: this.weekSunday,
            weekdayMon: this.weekMonday,
            weekdayTue: this.weekTuesday,
            weekdayWed: this.weekWednesday,
            weekdayThu: this.weekThursday,
            weekdayFri: this.weekFriday,
            weekdaySat: this.weekSaturday,
            periodMinutes: (60 * hour) + min
        }
    }

    private _onHold() {
        const self = this
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let timerHold = setTimeout(async function tick() {
            if (appLoader.list.filter(f => f.state !== 'done').length <= 0) {
                appLogger.debug('app', 'service in hold state')
                if (self._holdAuto) {
                    appLogger.debug('app', 'app stop after 10 sec')
                    setTimeout(() => process.exit(0), 10000)
                }
            } else {
                timerHold = setTimeout(tick, 1000)
            }
        }, 1000)
    }
}