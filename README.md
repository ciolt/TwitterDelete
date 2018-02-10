# TwitterDelete
TwitterDelete is a small application to delete your old, unpopular Tweets.

## Features
- Delete, unfavorite and unretweet Tweets
- Keep Tweets based on age, retweet or likes count
- Delete Tweets no longer exposed by Twitter API from a downloaded Twitter archive file

## Usage
To setup locally run:
```bash
git clone https://github.com/ciolt/TwitterDelete.git
cd TwitterDelete/
npm install
```

Get the Twitter API variables from https://apps.twitter.com and add the following variables to a `.env` file in the `TwitterDelete` folder:
```bash
TWITTER_CONSUMER_KEY=...
TWITTER_CONSUMER_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_TOKEN_SECRET=...
```

Now run TwitterDelete:
```bash
./TwitterDelete.js --user TwitterUsername
```

## Contact
[Bryan Agredo](mailto:hey@bryan.plus)

## License
TwitterDelete is licensed under the [ISC License](https://en.wikipedia.org/wiki/ISC_license).
