const fetch = require('node-fetch');
const JWT = require('jsonwebtoken');
const JWS = require('jws');

const token = `eyJ0eXAiOiJKV1QiLCJraWQiOiIzMWFmZTU2MS02OTUyLTQ1YTEtOGU0Mi05YjM2OWQwNTI5ODkiLCJhbGciOiJFUzI1NiIsImlzcyI6Imh0dHBzOi8vY29nbml0by1pZHAudXMtd2VzdC0yLmFtYXpvbmF3cy5jb20vdXMtd2VzdC0yX001TWI3VndOdiIsImNsaWVudCI6IjFjMHM5cXYzdXV2YTVxMXVzcGVnczZlaHNtIiwic2lnbmVyIjoiYXJuOmF3czplbGFzdGljbG9hZGJhbGFuY2luZzp1cy13ZXN0LTI6Mzg3Mjg2Mjk3MzE1OmxvYWRiYWxhbmNlci9hcHAvTUVBTlRULUFwcEFMLXFhWGI5WDcwV3BSMS85NWQyNzcwNGRiZGY1NzE5IiwiZXhwIjoxNzAzMDI3MDY3fQ==.eyJzdWIiOiI1OWU0YTkwNy02NzQ4LTRlNWYtODUzZC0wMmM0YTcwNmE1YjUiLCJlbWFpbCI6ImtraEBra2guaW8iLCJ1c2VybmFtZSI6IjU5ZTRhOTA3LTY3NDgtNGU1Zi04NTNkLTAyYzRhNzA2YTViNSIsImV4cCI6MTcwMzAyNzA2NywiaXNzIjoiaHR0cHM6Ly9jb2duaXRvLWlkcC51cy13ZXN0LTIuYW1hem9uYXdzLmNvbS91cy13ZXN0LTJfTTVNYjdWd052In0=.y_B2_t6ORlDtfyOmoMDMj3VR-vrAITgGOvcBL21u_YpOdzgQYECZhH5-o_fGQikgwb2AsTR2MggLVDErjmGoVg==`

async function test(){
const jwt_headers = token.split('.')[0]
const decoded_jwt_headers = Buffer.from(jwt_headers, 'base64').toString('utf8');
const jtoken = JSON.parse(decoded_jwt_headers);
const kid = jtoken.kid;
console.log(jtoken)
// console.log(`kid: ${encoded_jwt}`);

// Payload
const jwt_pay = token.split('.')[1]
const decoded_jwt_pay = Buffer.from(jwt_pay, 'base64').toString('utf8');
const jwt = JSON.parse(decoded_jwt_pay);

console.log(jwt)



const verificationURL = `https://public-keys.auth.elb.us-west-2.amazonaws.com/${kid}`
const pbRes = await fetch(verificationURL);
const pubKey = await pbRes.text();

const isValid = JWS.verify(token, 'ES256', pubKey);
console.log(isValid);
}
test();