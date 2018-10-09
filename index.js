var EventEmitter = require('events');

function Areq(emitter, areqTimeout) {
    if (! (emitter instanceof EventEmitter))
        throw new TypeError('Input emitter should be an EventEmitter.');

    this._emitter = emitter;
    this._areqTimeout = areqTimeout || 30000;
    this._pendings = {};    // { evtName: { deferred, listener }, ... }
}

Areq.prototype.changeDefaultTimeout = function (time) {
    if (typeof time !== 'number' || time < 1)
        throw new TypeError('Time for timeout should be a number and greater than 1ms.');

    this._areqTimeout = time;
    return this._areqTimeout;
};

Areq.prototype.getRecord = function (evt) {
    throwIfEvtNotString(evt);
    return this._pendings[evt];
};

Areq.prototype.isEventPending = function (evt) {
    throwIfEvtNotString(evt);
    return !!this._pendings[evt];
};

Areq.prototype.register = function (evt, deferred, listener, time, once) {
    once = once === undefined ? true : once

    var registered = false,
        areqTimeout = time || this._areqTimeout;

    if (typeof listener !== 'function')
        throw new TypeError('listener should be a function.');

    if (this.getRecord(evt)) {  // someone waiting same event, throw if evt is not a string
        registered = false;
    } else {
        if (!deferred.hasOwnProperty('promise'))
            throw new TypeError('deferred should be a deferred object of Promise.');

        if(once){
            this._emitter.once(evt, listener);
        }else{
            this._emitter.on(evt, listener);
        }
        this._pendings[evt] = {
            listener: listener,
            deferred: deferred
        }
        registered = true;

        this.setTimeout(evt, areqTimeout)
        deferred.promise.finally(function(){
            var p = this._pendings[evt]
            if(p && p.timeout){
                clearTimeout(p.timeout)
                delete p.timeout
            }
        }.bind(this)).catch(function(){})
    }

    return registered;
};

Areq.prototype.setTimeout = function(evt, areqTimeout){
    var self = this

    var p = this._pendings[evt]
    if(p){
        var message = "Areq "+evt+" timeout after "+(areqTimeout/1000)+" seconds"
        if(p.timeout) clearTimeout(p.timeout)
        p.timeout = setTimeout(function() {
            var err = new Error(message)
            err.code = 'ETIMEDOUT'
            self.reject(evt, err);
        }, areqTimeout)
    }
}

Areq.prototype.deregister = function (evt) {
    var rec = this.getRecord(evt),
        emitter = this._emitter;

    if (rec) {
        if (rec.deferred)
            rec.deferred = null;

        if (rec.listener) {
            emitter.removeListener(evt, rec.listener);
            rec.listener = null;
        }
        this._pendings[evt] = null;
        delete this._pendings[evt];
    }
};

Areq.prototype.resolve = function (evt, value) {
    var rec = this.getRecord(evt),
        deferred = rec ? rec.deferred : null;
    if (deferred && deferred.promise.isPending())
        deferred.resolve(value);

    this.deregister(evt);
};

Areq.prototype.reject = function (evt, err) {
    var rec = this.getRecord(evt),
        deferred = rec ? rec.deferred : null;
    if (deferred && deferred.promise.isPending())
        deferred.reject(err);

    this.deregister(evt);
};

function throwIfEvtNotString (evt) {
    if (typeof evt !== 'string')
        throw new TypeError('evt should be a string.');
}

module.exports = Areq;
