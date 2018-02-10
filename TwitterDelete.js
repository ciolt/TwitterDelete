'use strict';
require('dotenv').config();

const Twitter = require('twitter');
const commandLineArgs = require('command-line-args');
const File = require('fs');
const parse = require('csv-parse');

const ENV = process.env;
const MAX_API_TWEETS = 3200;
const MAX_TWEETS_PER_PAGE = 200.0;
const MAX_TWEETS_PER_REQUEST = 100;
const options = commandLineArgs([
  { name: 'force', alias: 'f', type: Boolean, defaultValue: false },
  { name: 'user', alias: 'u', type: String, defaultOption: true, defaultValue: process.env['TWITTER_USER'] },
  { name: 'csv', type: String },
  { name: 'days', type: Number, defaultValue: 30 },
  { name: 'olds', type: Number, defaultValue: 10000 },
  { name: 'rts', type: Number, defaultValue: 5 },
  { name: 'likes', type: Number, defaultValue: 5 },
]);

const client = new Twitter({
  consumer_key: ENV['CONSUMER_KEY'],
  consumer_secret: ENV['CONSUMER_SECRET'],
  access_token_key: ENV['ACCESS_TOKEN'],
  access_token_secret: ENV['ACCESS_TOKEN_SECRET']
});

Array.prototype.each_slice = function (size, callback){
  for (var i = 0, l = this.length; i < l; i += size){
    callback.call(this, this.slice(i, i + size));
  }
};

const oldestTweetTime = Date.now() - options.days * 24 * 60 * 60;
const newestTweetTime = Date.now() - options.olds * 24 * 60 * 60;

if (!options.user) {
  throw 'User not specified!\nUse the --user flag to set it.';
} else if (options.csv && !File.existsSync(options.csv)) {
  throw `${options.csv} must be a file that exists.`;
}

[ 'CONSUMER_KEY',
  'CONSUMER_SECRET',
  'ACCESS_TOKEN', 
  'ACCESS_TOKEN_SECRET'].forEach((variable) => {
    if(!ENV[variable]) {
      throw({
        message: `${variable} environment variable must be set.`
      });
    }
  }
);

const tooNew = (tweet) => {
  return tweet.created_at > oldestTweetTime || tweet.created_at < newestTweetTime;
};

const tooNewOrPopular = (tweet) => {
  if (tooNew(tweet)) return true;
  if (tweet.retweeted) return false;
  if (tweet.text.match(/^(RT @)([A-z0-9]){0,16}/g)) return false;
  
  if (tweet.retweet_count >= options.rts) {
    console.info(`Ignoring Tweet (Too many Retweets): ${tweet.text}`);
    return true;
  }

  if (tweet.favorite_count >= options.likes) {
    console.info(`Ignoring Tweet (Too many likes): ${tweet.text}`);
    return true;
  }

  return false;
};

const apiCall = (method, endpoint = '', options = {}, callback = () => {}) => {
  if (method.toLowerCase() === 'get') {
    client.get(endpoint, options, (error, data, response) => {
      if (error) {
        throw (error, `${method}: ${endpoint}`);
      } else {
        callback(data, error);
        return data;
      }
    });
  } else if (method.toLowerCase() === 'post') {
    client.post(endpoint, options, (error, data, response) => {
      if (error) {
        throw (error, endpoint, method);
      } else {
        callback(data, error);
        return data;
      }
    });
  }
};

let globalUser = {};

// Likes Variables
let totalLikes = 0;
let oldestLikesPage = 0;
let tweetsToUnlike = [];
let tweetsToDelete = [];

// Timeline Variables
let totalTweets;
let oldestTweetsPage;

new Promise((resolve) => {
  console.info('--> Checking likes...');
  
  apiCall('GET', 'users/show', {
    screen_name: options.user
  }, (user) => {
    globalUser = user;
    resolve();
    totalLikes = Math.min(user.favourites_count, MAX_API_TWEETS);
    oldestLikesPage = Math.ceil(totalLikes / MAX_TWEETS_PER_PAGE);
    let pages = [...Array(oldestLikesPage).keys()];
    
    pages.forEach((page, index) => {
      apiCall('GET', 'favorites/list', {
        count: MAX_TWEETS_PER_PAGE,
        page: page
      }, (tweets) => {
        tweets.forEach((tweet, $index) => {
          if (!tooNew(tweet)) tweetsToUnlike.push(tweet);
          if (pages.length === index + 1 && tweets.length === $index + 1) {
            resolve();
          }
        });
      });
    });
  });
}).then(() => {
  console.info('--> Checking timeline...');

  let user = globalUser;
  totalTweets = Math.min(user.statuses_count, MAX_API_TWEETS);
  oldestTweetsPage = Math.ceil(totalTweets / MAX_TWEETS_PER_PAGE);
  let pages = [...Array(oldestTweetsPage).keys()];

  return new Promise((resolve) => {
    pages.forEach((page, index) => {
      apiCall('GET', 'statuses/user_timeline', {
        count: MAX_TWEETS_PER_PAGE,
        page: page
      }, (tweets) => {
        tweets.forEach((tweet, $index) => {
          if (!tooNewOrPopular(tweet)) tweetsToDelete.push(tweet);
          if (pages.length === index + 1 && tweets.length === $index + 1) {
            resolve();
          }
        });
      });
    });
  });
}).then(() => {
  if (options.csv) {
    console.info('--> Checking archive CSV');
    let CSV_TweetIDs = [];
    parse(File.readFileSync(options.csv), (error, lines) => {
      if (error) console.error(`Error while reading CSV: ${error}`);
      lines.forEach((line) => {
        const tweetID = line[0];
        if (tweetID !== 'tweet_id') CSV_TweetIDs.push(tweetID);
      });
    });

    let TweetIDs = [];
    while (CSV_TweetIDs.length > 0) TweetIDs.push(CSV_TweetIDs.splice(0, 99));
    return new Promise ((resolve) => {
      TweetIDs.forEach((subsetTweetIDs, index) => {
        apiCall('GET', 'statuses/show', {
          id: subsetTweetIDs
        }, (tweets) => {
          tweets.forEach((tweet, $index) => {
            if (!tooNewOrPopular(tweet)) tweetsToDelete.push(tweet);
            if (TweetIDs.length === index + 1 && tweets.length === $index + 1) {
              resolve();
            }
          });
        });
      });
    });
  }
}).then(() => {
  if (!options.force) {
    console.info(`--> To unlike ${tweetsToUnlike.length} and delete ${tweetsToDelete.length} Tweets, re-run the command with --force`);
    process.exit(0);
  }
});

/*else {
  console.info(`--> Unfavoriting ${tweetsToUnlike.length} Tweets`);
  let tweetsNotFound = []
  tweetsToUnlike.each_slice(MAX_TWEETS_PER_REQUEST).forEach((tweets) => {
    apiCall('POST', 'favorites/destroy', {
      id: tweets
    });
  });
    begin
      api_call :unfavorite, tweets
    rescue Twitter::Error::NotFound
      tweetsNotFound += tweets
    end
  end

  puts "==> Deleting #{tweets_to_delete.size} tweets"
  tweets_to_delete.each_slice(MAX_TWEETS_PER_REQUEST) do |tweets|
    begin
      api_call :destroy_status, tweets
    rescue Twitter::Error::NotFound
      tweetsNotFound += tweets
    end
  end

  tweetsNotFound.each do |tweet|
    begin
      api_call :destroy_status, tweet
    rescue Twitter::Error::NotFound
    end
  end
}*/