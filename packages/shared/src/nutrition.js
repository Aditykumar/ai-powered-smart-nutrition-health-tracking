const activityFactor = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
};
export function estimateDailyCalories(profile) {
    const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
    const genderOffset = profile.gender === "male" ? 5 : profile.gender === "female" ? -161 : -78;
    const maintenance = (base + genderOffset) * activityFactor[profile.activityLevel];
    if (profile.goal === "weight_loss") {
        return Math.max(1200, Math.round(maintenance - 350));
    }
    if (profile.goal === "muscle_gain") {
        return Math.round(maintenance + 250);
    }
    return Math.round(maintenance);
}
export function getMacroTargets(calories, goal) {
    const proteinRatio = goal === "muscle_gain" ? 0.3 : 0.25;
    const fatRatio = goal === "weight_loss" ? 0.25 : 0.3;
    const carbsRatio = 1 - proteinRatio - fatRatio;
    return {
        calories,
        proteinG: Math.round((calories * proteinRatio) / 4),
        carbsG: Math.round((calories * carbsRatio) / 4),
        fatG: Math.round((calories * fatRatio) / 9),
        fiberG: Math.round(calories / 1000 * 14),
        sugarG: Math.round(calories / 1000 * 25),
        sodiumMg: Math.round(2300),
    };
}
