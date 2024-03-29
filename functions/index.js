// import * as functions from 'firebase-functions';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs } from 'firebase/firestore';
// eslint-disable-next-line import/no-unresolved
import { onSchedule } from 'firebase-functions/v2/scheduler';
// eslint-disable-next-line import/extensions,import/no-extraneous-dependencies
import { OpenAI } from 'openai';
import config from './config.mjs';

const firebaseConfig = {
  apiKey: config.firebaseKey,
  authDomain: config.autoDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
};
const index = initializeApp(firebaseConfig);
const db = getFirestore(index);

export const setUp = onSchedule('0 6 * * *', async () => {
  const getToday = () => {
    const formatDate = date => `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
    const today = new Date();
    const yesterday = new Date(new Date().setDate(new Date().getDate() - 1));
    const todayCollection = formatDate(today);
    const yesterdayCollection = formatDate(yesterday);

    return [todayCollection, yesterdayCollection];
  };
  const generateText = async content => {
    const openai = new OpenAI({ apiKey: config.gptApiKey, dangerouslyAllowBrowser: true });
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: `Based on the information given by the article, extend the article to over 3,000 words like a professional journalist. The article : ${content}`,
        },
      ],
      model: 'gpt-3.5-turbo',
    });

    return chatCompletion;
  };
  const updateDocuments = async querySnapshot => {
    for (const document of querySnapshot.docs) {
      if (document.data().extend) {
        try {
          const article = document.data();
          console.log(article.title);
          // eslint-disable-next-line no-await-in-loop
          const content = await generateText(article.content);
          // eslint-disable-next-line no-await-in-loop
          await setDoc(doc(db, querySnapshot.query._path.segments[0], article.title), {
            content: content.choices[0].message.content,
            description: article.description,
            image: article.image,
            publishedAt: article.publishedAt,
            source: article.source,
            title: article.title,
            url: article.url,
          });
          console.log(article.content);
        } catch (e) {
          console.error(e.message);
        }
      }
    }
  };

  const [todayCollection, yesterdayCollection] = getToday();

  let querySnapshot = await getDocs(collection(db, todayCollection));
  querySnapshot = querySnapshot.docs.length
    ? await getDocs(collection(db, todayCollection))
    : await getDocs(collection(db, yesterdayCollection));

  updateDocuments(querySnapshot);
});
export const createArticles = onSchedule('0 6,12,18,22 * * *', async () => {
  async function postArticles() {
    const baseUrl = 'https://gnews.io/api/v4';
    const categories = [
      'general',
      'world',
      'nation',
      'business',
      'technology',
      'entertainment',
      'sports',
      'science',
      'health',
    ];
    const batchSize = 3;
    const apiKeys = [config.apiKey, config.secondApiKey, config.thirdApiKey];
    const date = new Date();
    const today = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;

    async function requestAndPostArticles(baseUrl, category, apiKey) {
      const requestUrl = `${baseUrl}/top-headlines?category=${category}&lang=en&country=us&apikey=${apiKey}`;
      const response = await fetch(requestUrl);

      if (!response.ok) {
        const error = response.status;
        if (error === 400) {
          throw new Error('Bad Request -- Your request is invalid.');
        } else if (error === 401) {
          throw new Error('Unauthorized -- Your API key is wrong.');
        } else if (error === 403) {
          throw new Error('Forbidden -- You have reached your daily quota, the next reset is at 00:00 UTC.');
        } else if (error === 429) {
          throw new Error('Too Many Requests -- You have made more requests per second than you are allowed.');
        } else if (error === 500) {
          throw new Error('Internal Server Error -- We had a problem with our server. Try again later.');
        } else if (error === 503) {
          throw new Error("Service Unavailable -- We're temporarily offline for maintenance. Please try again later.");
        } else {
          throw new Error('An unexpected error occurred.');
        }
      }

      const { articles } = await response.json();

      articles?.forEach((article, index) => {
        if (index <= 5) {
          setDoc(doc(db, today, article.title), {
            content: article.content,
            description: article.description,
            image: article.image,
            publishedAt: article.publishedAt,
            source: article.source,
            title: article.title,
            url: article.url,
            extend: true,
          });
        } else {
          setDoc(doc(db, today, article.title), {
            content: article.content,
            description: article.description,
            image: article.image,
            publishedAt: article.publishedAt,
            source: article.source,
            title: article.title,
            url: article.url,
          });
        }
      });
    }
    async function fetchArticlesWithRetry(category) {
      for (const apiKey of apiKeys) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await requestAndPostArticles(baseUrl, category, apiKey);
          break;
        } catch (error) {
          console.log(error.message);
        }
      }
    }

    for (let i = 0; i < categories.length; i += batchSize) {
      const batch = categories.slice(i, i + batchSize);
      const requestPromises = batch.map(fetchArticlesWithRetry);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(requestPromises);
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => {
        setTimeout(resolve, 2000);
      });
    }
  }
  async function postSearches() {
    const baseUrl = 'https://gnews.io/api/v4/search';
    const keywords = ['elon', 'meta', 'nft', 'crypto', 'ai', 'youtube', 'korea', 'hiphop', 'programming'];
    const batchSize = 3;
    const apiKeys = [config.apiKey, config.secondApiKey, config.thirdApiKey];
    async function requestAndPostArticles(baseUrl, search, apiKey) {
      const requestUrl = `${baseUrl}/?q=${search}&lang=en&country=us&apikey=${apiKey}`;
      const response = await fetch(requestUrl);

      if (!response.ok) {
        const error = response.status;
        if (error === 400) {
          throw new Error('Bad Request -- Your request is invalid.');
        } else if (error === 401) {
          throw new Error('Unauthorized -- Your API key is wrong.');
        } else if (error === 403) {
          throw new Error('Forbidden -- You have reached your daily quota, the next reset is at 00:00 UTC.');
        } else if (error === 429) {
          throw new Error('Too Many Requests -- You have made more requests per second than you are allowed.');
        } else if (error === 500) {
          throw new Error('Internal Server Error -- We had a problem with our server. Try again later.');
        } else if (error === 503) {
          throw new Error("Service Unavailable -- We're temporarily offline for maintenance. Please try again later.");
        } else {
          throw new Error('An unexpected error occurred.');
        }
      }

      const { articles } = await response.json();

      articles?.forEach(article =>
        setDoc(doc(db, search, article.title), {
          content: article.content,
          description: article.description,
          image: article.image,
          publishedAt: article.publishedAt,
          source: article.source,
          title: article.title,
          url: article.url,
        }),
      );

      console.log(`${search} : successfully loaded`);
    }
    async function fetchArticlesWithRetry(search) {
      for (const apiKey of apiKeys) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await requestAndPostArticles(baseUrl, search, apiKey);
          break;
        } catch (error) {
          console.log('Search Failed');
        }
      }
    }

    for (let i = 0; i < keywords.length; i += batchSize) {
      const batch = keywords.slice(i, i + batchSize);
      const requestPromises = batch.map(fetchArticlesWithRetry);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(requestPromises);
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => {
        setTimeout(resolve, 1500);
      });
    }
  }
  async function postDates() {
    const getWeekDates = () => {
      const dates = [];
      const today = new Date();
      const dayOfWeek = today.getDay(); // 오늘의 요일 인덱스 (일요일 = 0)
      const dayOfMonth = today.getDate();
      const month = today.getMonth();
      const year = today.getFullYear();
      const differenceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(year, month, dayOfMonth + differenceToMonday);

      for (let i = 0; i <= 6; i++) {
        let date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        if (date > today) {
          date = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7);
        }
        dates.push(`${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`);
      }

      return dates;
    };

    const baseUrl = 'https://gnews.io/api/v4/search';
    const dates = getWeekDates();
    const batchSize = 3;
    const apiKeys = [config.apiKey, config.secondApiKey, config.thirdApiKey];
    async function requestAndPostArticles(baseUrl, date, apiKey) {
      const requestUrl = `${baseUrl}/?&q=and&from=${''}T20:00:00Z&to=${date}:T24:00:00Z&in=description,content&lang=en&country=us&apikey=${apiKey}`;
      const response = await fetch(requestUrl);

      if (!response.ok) {
        const error = response.status;
        if (error === 400) {
          throw new Error('Bad Request -- Your request is invalid.');
        } else if (error === 401) {
          throw new Error('Unauthorized -- Your API key is wrong.');
        } else if (error === 403) {
          throw new Error('Forbidden -- You have reached your daily quota, the next reset is at 00:00 UTC.');
        } else if (error === 429) {
          throw new Error('Too Many Requests -- You have made more requests per second than you are allowed.');
        } else if (error === 500) {
          throw new Error('Internal Server Error -- We had a problem with our server. Try again later.');
        } else if (error === 503) {
          throw new Error("Service Unavailable -- We're temporarily offline for maintenance. Please try again later.");
        } else {
          throw new Error('An unexpected error occurred.');
        }
      }

      const { articles } = await response.json();

      articles?.forEach(article =>
        setDoc(doc(db, `${date}`, article.title), {
          content: article.content,
          description: article.description,
          image: article.image,
          publishedAt: article.publishedAt,
          source: article.source,
          title: article.title,
          url: article.url,
        }),
      );
    }
    async function fetchArticlesWithRetry(date) {
      for (const apiKey of apiKeys) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await requestAndPostArticles(baseUrl, date, apiKey);
          break;
        } catch (error) {
          console.log(`${error.message} failed - date`);
        }
      }
    }

    for (let i = 0; i < dates.length; i += batchSize) {
      const batch = dates.slice(i, i + batchSize);
      const requestPromises = batch.map(fetchArticlesWithRetry);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(requestPromises);
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => {
        setTimeout(resolve, 1500);
      });
    }
  }

  await postArticles();
  await postSearches();
  await postDates();
});
