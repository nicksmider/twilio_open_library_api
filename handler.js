"use strict";
const https = require("https");

function getAuthor(author) {
  if (!author) {
    return Promise.resolve(null);
  }
  const url = new URL("https://openlibrary.org/search/authors.json");
  url.searchParams.append("q", author);

  return new Promise((resolve, reject) => {
    console.log({ url: url.toString() });
    const req = https.get(url.toString(), (res) => {
      let rawData = "";

      res.on("data", (chunk) => {
        rawData += chunk;
      });

      res.on("end", () => {
        try {
          resolve(JSON.parse(rawData));
        } catch (err) {
          reject(new Error(err));
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(err));
    });
  });
}

function paramsToObject(entries) {
  const result = {};
  for (const [key, value] of entries) {
    // each 'entry' is a [key, value] tupple
    result[key] = value;
  }
  return result;
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

const twilio = require("twilio");
const client = twilio(accountSid, authToken);

const authorCache = new Map();

module.exports.twilioHandler = async (event, _, callback) => {
  const decodedEvent = decodeURI(event.body);
  const params = new URLSearchParams(decodedEvent);

  const paramsObj = paramsToObject(params.entries());

  console.log(paramsObj);

  if (
    !twilio.validateRequest(
      authToken,
      event.headers["X-Twilio-Signature"],
      "https://" + event.requestContext.domainName + event.requestContext.path,
      paramsObj
    )
  ) {
    throw new Error("request not from twilio!");
  }

  const authorToLookUp = params.get("Body");

  let responseBody = "No author found here!";

  if (authorCache.has(authorToLookUp)) {
    console.log("using cache");
    responseBody = authorCache.get(authorToLookUp);
  } else {
    try {
      const response = await getAuthor(authorToLookUp);
      const authorData = response?.docs?.[0];

      if (authorData) {
        if (authorData.birth_date) {
          responseBody = `${authorData.name} was born on ${authorData.birth_date} and their best work is ${authorData.top_work}`;
        } else {
          responseBody = `${authorData.name}'s best work is ${authorData.top_work}`;
        }
      }

      authorCache.set(authorToLookUp, responseBody);
    } catch (e) {
      console.log(e);
    }
  }

  try {
    const request = {
      body: responseBody,
      from: twilioNumber,
      to: params.get("From"),
    };
    const { sid } = await client.messages.create(request);

    console.log({ sid, ...request });
  } catch (e) {
    console.error(e);
  }

  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  };

  callback(null, response);
};
