(function() {

    function cloneFrame(a) {
        return JSON.parse(JSON.stringify(a));
    }

    function Animation(filterList, target) {
        this.timeline = null;
        this.filterList = filterList;
        filterList.animation = this;
        this._keyframes = [];
        this._currentTime = 0;
        this.target = target;
        this.computeDefaultKeyframe();
        this.update();
    }

    Animation.prototype = {

        keyframes: function() {
            return this._keyframes;
        },

        currentTime: function() {
            return this._currentTime;
        },
        
        maxTime: function() {
            return this._maxTime;
        },

        /* Computes the keyframes in the neighborhood of the specified time.
         * - If there is a keyframe at the specific time it will just return an
         * array with a single keyframe.
         * - If there are no keyframes at the specific time it will return an
         * array with 3 elements:
         *   - 0: first keyframe
         *   - 1: second keyframe
         *   - 2: delta time between the keyframes, useful for blending operations.
         */
        _currentKeyframeSet: function(time) {
            var keyframes = this.keyframes();
            if (!keyframes.length)
                return null;

            if (keyframes[0].time > time)
                return null;
            
            if (keyframes[keyframes.length - 1].time < time)
                return null;
                
            for (var i = 0; i < keyframes.length; ++i) {
                if (keyframes[i].time > time)
                    break;
            }
            
            var key1 = keyframes[i - 1];
            if (key1.time == time)
                return [key1];

            var key2 = keyframes[i];

            if (key1.time == key2.time)
                return [key1];
            
            var a = (time - key1.time) / (key2.time - key1.time);
            return [key1, key2, a];
        },

        _currentKeyframe: function (time) {
            var set = this.currentKeyframeSet(time);
            if (set && set.lenght == 1)
                return set[0];
            return this.calculateKeyframe(time);
        },

        currentKeyframe: function(time) {
            if (time === undefined || time == this.currentTime())
                return this._cachedCurrentKeyFrame;
            return this._currentKeyframe(time);
        },
        
        currentKeyframeSet: function(time) {
            if (time === undefined || time == this.currentTime())
                return this._cachedCurrentKeyframeSet;
            return _currentKeyframeSet(time);
        },

        prevKeyframe: function() {
            var keyframes = this.keyframes();
            if (!keyframes || !keyframes.length)
                return null;
            
            var time = this.currentTime();
            if (time <= keyframes[0].time)
                return null;
            if (time > keyframes[keyframes.length - 1].time)
                return keyframes[keyframes.length - 1];
            
            var set = this.currentKeyframeSet(time);
            if (!set)
                return null;
            if (set.length != 1)
                return set[0];
            
            var index = keyframes.indexOf(set[0]);
            if (index <= 0)
                return null;

            return keyframes[index - 1];
        },

        nextKeyframe: function() {
            var keyframes = this.keyframes();
            if (!keyframes || !keyframes.length)
                return null;
            
            var time = this.currentTime();
            if (time >= keyframes[keyframes.length - 1].time)
                return null;
            if (time < keyframes[0].time)
                return keyframes[0];
            
            var set = this.currentKeyframeSet(time);
            if (!set)
                return null;
            if (set.length != 1)
                return set[1];
                        
            var index = keyframes.indexOf(set[0]);
            if (index < 0 || index > keyframes.length - 2)
                return;
            
            return keyframes[index + 1];
        },
        
        updateCachedValues: function() {
            var oldKeyframe = this._cachedCurrentKeyFrame;
            
            var time = this.currentTime();
            this._cachedCurrentKeyframeSet = this._currentKeyframeSet(time);
            this._cachedCurrentKeyFrame = this._currentKeyframe(time);
            
            this.filterList.setSource(this._cachedCurrentKeyFrame);
            if (oldKeyframe !== this._cachedCurrentKeyFrame && this.timeline)
                this.timeline.onNewFrameSelected(this._cachedCurrentKeyFrame, oldKeyframe);
        },

        update: function() {
            this.updateCachedValues();
            this.updateFilters();
            if (this.timeline)
                this.timeline.onTimeUpdated();
        },

        setCurrentTime: function(newTime) {
            this._currentTime = newTime;
            this.update();
        },

        setActiveKeyframe: function(keyframe) {
            if (!keyframe)
                return;
            this.setCurrentTime(keyframe.time);
        },

        sortKeyframes: function() {
            var keyframes = this.keyframes();
            keyframes.sort(function(a, b) { return a.time - b.time; });
        },

        createKeyframe: function(time, source) {
            var keyframe = new Global.Keyframe(this.filterList, time, source),
                keyframes = this.keyframes();
            
            keyframes.push(keyframe);
            if (this.timeline)
                this.timeline.onKeyframeCreated(keyframe);
            this.sortKeyframes();
            this.update();
        },

        getFiltersAtTime: function(time, colorScheme) {
            var filters = this.filterList.activeFilters(),
                keyframe = this.currentKeyframe(time),
                value = keyframe.value,
                result = [];
            $.each(filters, function(i, filter) {
                result.push(filter.generateCode(value[filter.name], colorScheme));
            });
            return result;
        },

        updateFilters: function() {
            var filterProperty = this.getFiltersAtTime(this.currentTime());
            if (!filterProperty)
                return;
            this.target.css("-webkit-filter", filterProperty.join(" "));
        },

        computeDefaultKeyframe: function() {
            this.defaultKeyframe = new Global.Keyframe(this.filterList, 0, {});
        },

        calculateKeyframe: function(time) {
            var set = this.currentKeyframeSet();
            if (!set) {
                var keyframes = this.keyframes();
                if (!keyframes.length)
                    return this.defaultKeyframe.makeGeneratedClone(time);
                
                if (keyframes[0].time > time)
                    return keyframes[0].makeGeneratedClone(time);
                if (keyframes[keyframes.length - 1].time < time)
                    return keyframes[keyframes.length - 1].makeGeneratedClone(time);
                throw new Error("ASSERT_NOT_REACHED");
            }
            if (set.length == 1)
                return set[0];
            
            return set[0].blend(set[1], set[2], time);
        },

        onFilterStateChange: function(filter) {
            if (filter.active)
                this.addFilterDefaultValues(filter);
            else
                this.removeFilterValue(filter);
        },

        addFilterDefaultValues: function(filter) {
            $.each(this.keyframes(), function(index, keyframe) {
                keyframe.addFilterDefaultValue(filter);
            });
            this.defaultKeyframe.addFilterDefaultValue(filter);
            this.update();
        },

        removeFilterValue: function(filter) {
            $.each(this.keyframes(), function(index, keyframe) {
                keyframe.removeFilterValue(filter);
            });
            this.defaultKeyframe.removeFilterValue(filter);
            this.update();
        },

        keyframeUpdated: function(keyframe, filter, paramName) {
            if (keyframe.generated)
                this.createKeyframe(keyframe.time, keyframe.value);
            else
                this.updateFilters();
        },

        removeKeyframe: function(keyframe) {
            var keyframes = this.keyframes();
            var i = keyframes.indexOf(keyframe);
            if (i < 0)
                return;
            if (this.timeline)
                this.timeline.onKeyframeRemoved(keyframe);
            keyframes.splice(i, 1);
            this.update();
        },

        toggleKeyframe: function() {
            var keyframe = this.currentKeyframe();
            if (!keyframe)
                return;
            if (keyframe.generated)
                this.createKeyframe(keyframe.time, keyframe.value);
            else
                this.removeKeyframe(keyframe);
        }
    }

    Global.Animation = Animation;

    Global.cloneFrame = cloneFrame;

})();