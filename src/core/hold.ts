import { TSetting, TSettingPause } from "./setting";
import * as vv from 'vv-common'
import { Timer } from "./timer";

export type THoldState = 'holdManual' | 'stopPrepare' | 'stop' | 'holdAuto' | ''

type TWeekDay = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'
const WEEK = ['sunday',  'monday',  'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as TWeekDay[]

export class Hold {
    private _state = undefined as THoldState
    private _setting = undefined as TSetting
    private _eventOnHold = undefined as (stateHold: THoldState) => void

    private _stopTime = [] as {weekDay: TWeekDay, time: Time}[]
    private _pauseTime = [] as {weekDay: TWeekDay, time1: Time, time2: Time}[]

    constructor() {
        const timer = new Timer(500, () => {
            this._onTimer()
            timer.nextTick()
        })
    }

    setSetting(setting: TSetting): {error: string[], debug: string[], trace: string[]} {
        const error = [] as string[]
        const debug = [] as string[]
        const trace = [] as string[]

        if (this._state === 'stopPrepare') {
            return {error, debug, trace}
        }
        if (JSON.stringify(this._setting?.service) === JSON.stringify(setting?.service)) {
            return {error, debug, trace}
        }

        this._setting = setting

        this._stopTime.splice(0)
        WEEK.forEach(wd => {
            const stop = this._fromSettingGetStop(wd)
            if (vv.isEmpty(stop)) return

            const time = new Time(stop)
            if (vv.isEmpty(time.time())) {
                error.push(`setting has bad param "service.stop.${wd}" = "${stop}"`)
                return
            }

            this._stopTime.push({weekDay: wd, time: time})
        })

        this._pauseTime.splice(0)
        WEEK.forEach(wd => {
            const pause = this._fromSettingGetPause(wd)
            if (vv.isEmpty(pause.time) || pause.duration <= 0) return

            if (pause.duration > 1440) {
                error.push(`setting has bad param "service.holdAuto.${wd}.duration" = "${pause.duration}"`)
                return
            }

            const time1 = new Time(pause.time)
            if (vv.isEmpty(time1.time())) {
                error.push(`setting has bad param "service.holdAuto.${wd}.time" = "${time1.timeStr}"`)
                return
            }

            const time2Date = vv.dateAdd(time1.time(), 'minute', pause.duration)
            if (time1.time().getDate() === time2Date.getDate()) {
                this._pauseTime.push({weekDay: wd, time1: time1, time2: new Time(vv.dateFormat(time2Date, 'hh:mi'))})
            } else {
                this._pauseTime.push({weekDay: wd, time1: time1, time2: undefined})
                this._pauseTime.push({weekDay: this._getWeekDayNear(wd).next, time1: undefined, time2: new Time(vv.dateFormat(time2Date, 'hh:mi'))})
            }
        })
        return {error, debug, trace}
    }

    eventOnHold(event: (stateHold: THoldState) => void) {
        this._eventOnHold = event
    }

    private _onTimer() {
        if (this._state === 'stopPrepare' || this._state === 'stop' || vv.isEmpty(this._setting)) return

        const now = new Date()
        const stopTime = this._stopTime.find(f => f.weekDay === this._getWeekDay(now))
        if (!vv.isEmpty(stopTime) && stopTime.time.time() > now && vv.dateAdd(now, 'minute', 5) > stopTime.time.time()) {
            setTimeout(() => {
                this._sendEventState('stop')
            }, 1000 * 60 * 5)
            this._sendEventState('stopPrepare')
            return
        }

        let isPause = false
        this._pauseTime.filter(f => f.weekDay === this._getWeekDay(now)).forEach(item => {
            if (
                (item.time1 === undefined && item.time2 !== undefined && item.time2.time() > now) ||
                (item.time1 !== undefined && now > item.time1.time() && item.time2 === undefined) ||
                (item.time1 !== undefined && item.time2 !== undefined && now > item.time1.time() && item.time2.time() > now)
            ) {
                this._sendEventState('holdAuto')
                isPause = true
            }
        })
        if (isPause) return

        if (this._setting?.service.holdManual) {
            this._sendEventState('holdManual')
            return
        }

        this._sendEventState('')
    }

    private _sendEventState(state: THoldState) {
        if (vv.isEmpty(this._eventOnHold)) return
        if (state === 'stop') {
            this._eventOnHold(state)
            this._state = state
            return
        }
        if (state === 'stopPrepare') {
            if (this._state === 'stop' || this._state === 'stopPrepare') return
            this._eventOnHold(state)
            this._state = state
            return
        }
        if (state === 'holdAuto') {
            if (this._state === 'holdAuto' || this._state === 'stop' || this._state === 'stopPrepare') return
            this._eventOnHold(state)
            this._state = state
            return
        }
        if (state === 'holdManual') {
            if (this._state === 'holdManual' || this._state === 'holdAuto' || this._state === 'stop' || this._state === 'stopPrepare') return
            this._eventOnHold(state)
            this._state = state
            return
        }

        if (state === '') {
            if (this._state === undefined || this._state === 'holdManual' || this._state === 'holdAuto') {
                this._eventOnHold(state)
                this._state = state
            }
        }
    }

    private _getWeekDay(d: Date): TWeekDay {
        const day = d.getDay()
        return day === 0 ? 'sunday'
            : day === 1 ? 'monday'
            : day === 1 ? 'tuesday'
            : day === 1 ? 'wednesday'
            : day === 1 ? 'thursday'
            : day === 1 ? 'friday'
            : 'saturday'
    }

    private _getWeekDayNear(wd: TWeekDay): {prev: TWeekDay, next: TWeekDay}  {
        return wd === 'sunday' ? {
            prev: 'saturday',
            next: 'monday'
        } : wd === 'monday' ? {
            prev: 'sunday',
            next: 'tuesday'
        } : wd === 'tuesday' ? {
            prev: 'monday',
            next: 'wednesday'
        } : wd === 'wednesday' ? {
            prev: 'tuesday',
            next: 'thursday'
        } : wd === 'thursday' ? {
            prev: 'wednesday',
            next: 'friday'
        } : wd === 'friday' ? {
            prev: 'thursday',
            next: 'saturday'
        } : {
            prev: 'friday',
            next: 'sunday'
        }
    }

    private _fromSettingGetStop(weekday: TWeekDay): string {
        return weekday === 'sunday' ? this._setting?.service.stop.sunday
            : weekday === 'monday' ? this._setting?.service.stop.monday
            : weekday === 'tuesday' ? this._setting?.service.stop.tuesday
            : weekday === 'wednesday' ? this._setting?.service.stop.wednesday
            : weekday === 'thursday' ? this._setting?.service.stop.thursday
            : weekday === 'friday' ? this._setting?.service.stop.friday
            : this._setting?.service.stop.saturday
    }

    private _fromSettingGetPause(weekday: TWeekDay): TSettingPause {
        return weekday === 'sunday' ? this._setting?.service.holdAuto.sunday
            : weekday === 'monday' ? this._setting?.service.holdAuto.monday
            : weekday === 'tuesday' ? this._setting?.service.holdAuto.tuesday
            : weekday === 'wednesday' ? this._setting?.service.holdAuto.wednesday
            : weekday === 'thursday' ? this._setting?.service.holdAuto.thursday
            : weekday === 'friday' ? this._setting?.service.holdAuto.friday
            : this._setting?.service.holdAuto.saturday
    }

}


class Time {
    timeStr = undefined as string

    constructor(timeStr?: string) {
        this.timeStr = timeStr
    }

    public time(): Date {
        if (this.timeStr?.length !== 5) return undefined
        const hour = vv.toIntPositive(this.timeStr.substring(0, 2))
        const min = vv.toIntPositive(this.timeStr.substring(3, 5))
        if (hour === undefined || hour > 23) return undefined
        if (min === undefined || min > 59) return undefined
        const now = new Date()
        return vv.dateAdd(vv.dateAdd(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 'hour', hour), 'minute', min)
    }
}