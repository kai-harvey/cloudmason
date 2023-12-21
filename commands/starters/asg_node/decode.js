const fetch = require('node-fetch');
const JWT = require('jsonwebtoken');
const JWS = require('jws');

const token = `eyJraWQiOiJzQVV0WWdnKzRueGtuejVVS1RGOEFcL3pzMVZpWStOQUh2RDB5YnJCWjZLTT0iLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI1OWU0YTkwNy02NzQ4LTRlNWYtODUzZC0wMmM0YTcwNmE1YjUiLCJjb2duaXRvOmdyb3VwcyI6WyJ1c2VyLWFkbWluIl0sImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC51cy13ZXN0LTIuYW1hem9uYXdzLmNvbVwvdXMtd2VzdC0yX001TWI3VndOdiIsInZlcnNpb24iOjIsImNsaWVudF9pZCI6IjFjMHM5cXYzdXV2YTVxMXVzcGVnczZlaHNtIiwib3JpZ2luX2p0aSI6ImUwM2Y4MjY3LTQzNzMtNGQxZS04ZTg0LTkwYzYxZGYzMDUzZCIsImV2ZW50X2lkIjoiZTY4ZmU3MjEtZDcxNC00MDM4LWE5ZDYtOTAyZGU1ODdlZWE3IiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJvcGVuaWQiLCJhdXRoX3RpbWUiOjE3MDMwMjY5NDcsImV4cCI6MTcwMzA5NTQ2MywiaWF0IjoxNzAzMDkxODYzLCJqdGkiOiJmNDU5NzFiZS1mZGE0LTRkNTgtYWExZi1hYzgxODM5OThhNjciLCJ1c2VybmFtZSI6IjU5ZTRhOTA3LTY3NDgtNGU1Zi04NTNkLTAyYzRhNzA2YTViNSJ9.NX00P0QHlUB9B4BZMvUvQTtv6KHWd_2lxQJgqjsPnIUychPbnB_n8LJ7D90zPHnSl5vhCkO2rISj3QDgYUZzNfO2xmnbyl5QqxS70pGXsKFM0W9k7i32EK7dEh57x5CcHG2dHKK4SAjXXQZY5bGUAu2Gj58bX7_TabOgEvo7h069CLmViXfTGyNLmuy6iRMZmJ6SNGaI_emq1Fns90EvpZW7u_QkDd-OOAMzLIQAHTJftApiaaibGuKxRegmaTL-HDl6pWIZCu9arixLsNY7YX-UiCvb0dh-WeWDp4MoogeaX-2B-o0u69UqjZhXrTfKKhwnjb-iRU5JDccmjxP73A`

async function test(){
const jwt_headers = token.split('.')[0]
const decoded_jwt_headers = Buffer.from(jwt_headers, 'base64').toString('utf8');
const jtoken = JSON.parse(decoded_jwt_headers);
const kid = jtoken.kid;
// console.log(jtoken)
// console.log(`kid: ${encoded_jwt}`);

// Payload
const jwt_pay = token.split('.')[1]
const decoded_jwt_pay = Buffer.from(jwt_pay, 'base64').toString('utf8');
const jwt = JSON.parse(decoded_jwt_pay);

console.log(jwt)

return

const verificationURL = `https://public-keys.auth.elb.us-west-2.amazonaws.com/${kid}`
const pbRes = await fetch(verificationURL);
const pubKey = await pbRes.text();

const isValid = JWS.verify(token, 'ES256', pubKey);
console.log(isValid);
}
test();