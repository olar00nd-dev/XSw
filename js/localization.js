// Localization system
const LOCALES = {
    en: {
        GAME_TITLE: 'WFLY WOOD MARKET',
        MAIN_MENU: {
            NEW_GAME: 'New Game',
            LOAD_GAME: 'Load Game',
            SETTINGS: 'Settings',
            EXIT: 'Exit',
        },
        SAVE_SLOTS: {
            SLOT: 'Slot',
            EMPTY: 'Empty Slot',
            BACK: 'Back',
        },
        SETTINGS: {
            TITLE: 'Settings',
            LANGUAGE: 'Language',
            BACK: 'Back',
        },
        PAUSE_MENU: {
            RESUME: 'Resume',
            SAVE: 'Save Game',
            SETTINGS: 'Settings',
            MAIN_MENU: 'Main Menu',
        },
        HUD: {
            MONEY: 'Money',
            WOOD: 'Wood',
            WAREHOUSE: 'Warehouse',
            SEASON: 'Season',
        },
        SEASONS: {
            WINTER: 'Winter',
            SPRING: 'Spring',
            SUMMER: 'Summer',
            FALL: 'Fall',
        },
        SHOP: {
            TITLE: 'Your Shop',
            HIRE_WORKER: 'Hire Lumberjack',
            HIRE_CASHIER: 'Hire Cashier',
            UPGRADE_AXE: 'Upgrade Axe',
            UPGRADE_WAREHOUSE: 'Upgrade Warehouse',
        },
        TRADER: {
            TITLE: 'Trader',
            BUY: 'Buy',
            SELL: 'Sell',
            CLOSE: 'Close',
        },
        MESSAGES: {
            TREE_CHOPPED: 'Tree chopped! Got wood.',
            NOT_ENOUGH_MONEY: 'Not enough money!',
            WAREHOUSE_FULL: 'Warehouse is full!',
            WORKER_HIRED: 'Worker hired!',
            UPGRADE_BOUGHT: 'Upgrade purchased!',
        },
    },
    ru: {
        GAME_TITLE: 'WFLY WOOD MARKET',
        MAIN_MENU: {
            NEW_GAME: 'Новая Игра',
            LOAD_GAME: 'Загрузить',
            SETTINGS: 'Настройки',
            EXIT: 'Выход',
        },
        SAVE_SLOTS: {
            SLOT: 'Слот',
            EMPTY: 'Пустой Слот',
            BACK: 'Назад',
        },
        SETTINGS: {
            TITLE: 'Настройки',
            LANGUAGE: 'Язык',
            BACK: 'Назад',
        },
        PAUSE_MENU: {
            RESUME: 'Продолжить',
            SAVE: 'Сохранить',
            SETTINGS: 'Настройки',
            MAIN_MENU: 'Главное Меню',
        },
        HUD: {
            MONEY: 'Деньги',
            WOOD: 'Дерево',
            WAREHOUSE: 'Склад',
            SEASON: 'Сезон',
        },
        SEASONS: {
            WINTER: 'Зима',
            SPRING: 'Весна',
            SUMMER: 'Лето',
            FALL: 'Осень',
        },
        SHOP: {
            TITLE: 'Ваша Лавка',
            HIRE_WORKER: 'Нанять Лесоруба',
            HIRE_CASHIER: 'Нанять Кассира',
            UPGRADE_AXE: 'Улучшить Топор',
            UPGRADE_WAREHOUSE: 'Улучшить Склад',
        },
        TRADER: {
            TITLE: 'Торговец',
            BUY: 'Купить',
            SELL: 'Продать',
            CLOSE: 'Закрыть',
        },
        MESSAGES: {
            TREE_CHOPPED: 'Дерево срублено! Получено дерево.',
            NOT_ENOUGH_MONEY: 'Недостаточно денег!',
            WAREHOUSE_FULL: 'Склад переполнен!',
            WORKER_HIRED: 'Работник нанят!',
            UPGRADE_BOUGHT: 'Улучшение куплено!',
        },
    },
};

class Localization {
    constructor() {
        this.currentLocale = CONFIG.DEFAULT_LOCALE;
    }

    setLocale(locale) {
        if (LOCALES[locale]) {
            this.currentLocale = locale;
            return true;
        }
        return false;
    }

    get(key) {
        const keys = key.split('.');
        let value = LOCALES[this.currentLocale];
        
        for (const k of keys) {
            if (value && typeof value === 'object') {
                value = value[k];
            } else {
                return key; // Return key if not found
            }
        }
        
        return value || key;
    }

    t(key) {
        return this.get(key);
    }
}

const i18n = new Localization();
