module.exports = {
    NetworkMod: function (mod) {
        const cache = {
            achievements: {},
            strings: {},
            progress: {}
        };

        function dungeonMessage(message) {
            mod.command.message(message);
        }

        async function getString(name) {
            const id = /^@Achievement:(?<id>\d+)$/.exec(name).groups.id;
            if (!(id in cache.strings)) {
                const result = await mod.queryData('/StrSheet_Achievement/String@id=?/', [Number(id)], false, false, ['string']);
                cache.strings[id] = result?.attributes.string ?? '';
            }
            return cache.strings[id];
        }

        async function getData(ids) {
            const filtered = ids.filter(id => !(id in cache.achievements));
            if (filtered.length > 0) {
                const achievements = await mod.queryData('/AchievementList/Achievement@id=?/', [ids], true);
                for (const { attributes: { id, name: rawName }, children } of achievements) {
                    const name = await getString(rawName);
                    const conditions = children
                        .filter(({ name, attributes: { type } }) => name === 'Condition' && type !== 'check')
                        .map(({ attributes }) => attributes);
                    for (const condition of conditions) {
                        if (condition.string !== undefined) condition.string = await getString(condition.string);
                    }
                    cache.achievements[id] = { name, conditions };
                }
            }
        }

        mod.hook('S_UPDATE_ACHIEVEMENT_PROGRESS', 1, ({ achievements }) => {
            getData(achievements.map(({ id }) => id)).then(() => {
                achievements.forEach(achievement => {
                    if (!(mod.game.me.name in cache.progress)) cache.progress[mod.game.me.name] = {};
                    if (achievement.id in cache.progress[mod.game.me.name] && achievement.id in cache.achievements) {
                        achievement.requirements.forEach(requirement => {
                            const cached = cache.progress[mod.game.me.name][achievement.id].requirements.find(({ index }) => index === requirement.index);
                            if (cached?.amount < requirement.amount) {
                                const achievementData = cache.achievements[achievement.id];
                                const conditionData = achievementData.conditions.find(({ id }) => id === requirement.index);
                                if (requirement.amount <= conditionData?.max) {
                                    const color = requirement.amount < conditionData.max ? "#FF0000" : "#008000";
                                    dungeonMessage(
                                        `<font color="#00FFFF">${achievementData.name}</font>: ` +
                                        `<font color="#FDD017">${conditionData.string}</font> ` +
                                        `(<font color="${color}">${requirement.amount}</font>/<font color="#008000">${conditionData.max}</font>)` +
                                        ` <font color="#AAAAAA">ID: ${achievement.id}</font>`
                                    );
                                }
                            }
                        });
                    }
                    cache.progress[mod.game.me.name][achievement.id] = achievement;
                });
            });
        });

        this.saveState = () => cache;
        this.destructor = () => { };
        this.loadState = state => Object.assign(cache, state);
    }
};
