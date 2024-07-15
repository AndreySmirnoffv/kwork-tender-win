const fs = require('fs');
const path = require('path');
const axios = require('axios'); // Использую axios так как другая библиотека справлялась не так как хотелось нужна для получения картинки
require('dotenv').config({ path: "./assets/modules/.env" });
const { Telegraf, session, Markup } = require('telegraf');
const bot = new Telegraf();
const infoJson = require('./assets/db/info.json');
let dbJson = require('./assets/db/db.json');

// Middleware для инициализации сессии
bot.use(session({
    property: 'session',
    getSessionKey: (ctx) => ctx.from && ctx.chat && `${ctx.from.id}:${ctx.chat.id}`,
}));

// Инициализация сессии для каждого пользователя
bot.use((ctx, next) => {
    if (!ctx.session) {
        ctx.session = {};
    }
    return next();
});

// Обработчик команды /start
bot.start(async (ctx) => {
    //смотрим есть ли такой юзер в базе данных
    let user = dbJson.find(user => user.username === ctx.from.username);

    if (!user) {
        user = {
            username: ctx.from.username,
            session_stage: "Была нажата команда старт",
        };
        dbJson.push(user);
    } else {
        user.session_stage = "Была нажата команда старт";
    }

    fs.writeFileSync('./assets/db/db.json', JSON.stringify(dbJson, null, 2));

    let titles = infoJson[0].Request.map(item => item.title);
    let inlineKeyboard = [];
    while (titles.length) {
        inlineKeyboard.push(titles.splice(0, 2).map(title => Markup.button.callback(title, title)));
    }

    // Отправляем инлайн клавиатуру
    const botMessage = await ctx.reply('Выберите раздел:', Markup.inlineKeyboard(inlineKeyboard));
    ctx.session.botMessageId = botMessage.message_id;
    ctx.session.userMessageId = ctx.message.message_id;
});

// Обработка инлайн кнопок
bot.action(/.+/, async (ctx) => {
    const selectedTitle = ctx.match[0];
    let user = dbJson.find(user => user.username === ctx.from.username);

    // Найдем подменю для выбранного заголовка
    let subMenuItems = infoJson[0].Request.find(item => item.title === selectedTitle)?.subMenu;

    if (subMenuItems) {
        let subMenuButtons = subMenuItems.map(subItem => Markup.button.callback(subItem.title, subItem.title));
        let subMenuKeyboard = [];
        while (subMenuButtons.length) {
            subMenuKeyboard.push(subMenuButtons.splice(0, 2)); // Строка с двумя кнопками
        }

        // Обновляем сообщение с подменю
        await ctx.editMessageText(`Подменю для ${selectedTitle}:`, Markup.inlineKeyboard(subMenuKeyboard));
    } else {
        await ctx.editMessageText("Ваши ответы были записаны");
    }

    // Обновление session_stage
    if (user) {
        user.session_stage = `Пользователь выбрал: ${selectedTitle}`;
        fs.writeFileSync('./assets/db/db.json', JSON.stringify(dbJson, null, 2));
    }

    await ctx.answerCbQuery(); // Завершение обработки нажатия на инлайн кнопку
});

// Обработка текстовых сообщений
bot.hears(/.+/, async (ctx) => {
    const title = ctx.message.text;
    let user = dbJson.find(user => user.username === ctx.from.username);
    let subMenuItems = infoJson[0].Request.find(item => item.title === title)?.subMenu;

    // Удаление сообщения пользователя и предыдущего сообщения бота
    if (ctx.session.userMessageId) {
        try {
            await ctx.deleteMessage(ctx.session.userMessageId);
        } catch (err) {
            console.error('Failed to delete user message:', err.message);
        }
    }
    if (ctx.session.botMessageId) {
        try {
            await ctx.deleteMessage(ctx.session.botMessageId);
        } catch (err) {
            console.error('Failed to delete bot message:', err.message);
        }
    }

    if (subMenuItems) {
        let subMenuButtons = subMenuItems.map(subItem => Markup.button.callback(subItem.title, subItem.title));
        let subMenuKeyboard = [];
        while (subMenuButtons.length) {
            subMenuKeyboard.push(subMenuButtons.splice(0, 2)); // Строка с двумя кнопками
        }
        const botMessage = await ctx.reply(`Подменю для ${title}:`, Markup.inlineKeyboard(subMenuKeyboard));
        ctx.session.botMessageId = botMessage.message_id;
    } else {
        const botMessage = await ctx.reply("Ваши ответы были записаны");
        ctx.session.botMessageId = botMessage.message_id;
    }

    if (user) {
        user.session_stage = `Пользователь выбрал: ${title}`;
        fs.writeFileSync('./assets/db/db.json', JSON.stringify(dbJson, null, 2));
    }
});

// Обработка фото
bot.on('photo', async (ctx) => {
    const photo = ctx.message.photo.pop(); // Получаем самое большое фото
    const photoId = photo.file_id;
    const fileLink = await ctx.telegram.getFileLink(photoId); // Получаем ссылку на фото

    // Скачиваем фото
    const fileName = `${Date.now()}.jpg`; // Название файла
    const filePath = path.join(__dirname, './assets/images/', fileName); // Путь к папке

    // Создаем папку, если она не существует
    if (!fs.existsSync(path.dirname(filePath))) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    // Скачиваем файл с помощью axios
    try {
        const response = await axios({
            url: fileLink,
            method: 'GET',
            responseType: 'arraybuffer'
        });
        fs.writeFileSync(filePath, Buffer.from(response.data)); // Сохраняем файл
        await ctx.reply(`Фото сохранено как ${fileName}`);
    } catch (error) {
        console.error('Error saving photo:', error.message);
        await ctx.reply('Ошибка при сохранении фото.');
    }
});

// Запуск бота
bot.launch().then(() => {
    console.log("Bot has started");
}).catch((err) => {
    console.error("Error launching bot:", err);
});
