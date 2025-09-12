# Alkoassistentti / Alkometriikka

Alkon tuotetietojen selaamiseen tarkoitettu selainpohjainen sovellus.

## Tietolähde

Sovellus käyttää Alkon avoimesti verkossa jakamaa hinnastoa ja sen tarjoamia tietoja. Hinnaston voit löytää [täältä](https://www.alko.fi/INTERSHOP/static/WFS/Alko-OnlineShop-Site/-/Alko-OnlineShop/fi_FI/Alkon%20Hinnasto%20Tekstitiedostona/alkon-hinnasto-tekstitiedostona.xlsx).

## Huomautus

Sovellus tarjoaa vain laskennallista ja informatiivista tietoa Alkon tuotteista.

Sovelluksen sisältö ei ole alkoholin markkinointia, myyntiä tai sen käyttöön kehoittamista. Alkoholin käyttöön liittyy terveysriskejä - käytä vastuullisesti.

# For developers

## Developing

The development server can be started using `npm run dev`
```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

A production build can be built by running:
```sh
npm run build
```

You can preview the production build with `npm run preview`.

## Deploying

If you intend on selfhosting, you need to make sure to include the price list in the root folder of the hosted website. This is necessary, as we don't want to flood Alko's systems with requests.

The "official" page manages this by using a GitHub Actions workflow to build the app, download the price list to the root of the built site, and then deploy it on GitHub Pages.
