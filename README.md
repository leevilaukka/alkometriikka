# Alkometriikka

Alkon tuotetietojen selaamiseen tarkoitettu selainpohjainen sovellus.

## Tietolähde

Sovellus käyttää Alkon avoimesti verkossa jakamaa dataa. Hinnasto kerätään Alkon rajapintojen tarjoamista tiedoista.

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

The build reads `build/data.json` once after Vite finishes and generates a static
`tuotteet/<id>/index.html` document for every product. These documents provide
product-specific HTML, canonical and social metadata, and JSON-LD while the
existing client application continues to provide the interactive experience.

To refresh only the product documents against an already-built site, run:

```sh
bun run prerender:products --data path/to/data.json --out path/to/site --template path/to/site/404.html
```

You can preview the production build with `npm run preview`.

## Deploying

If you intend on selfhosting, you need to make sure to include the price list in the root folder of the hosted website. This is necessary, as we don't want to flood Alko systems with requests. The current JSON used in production can be found on the `gh-pages` branch of this repo in the `data.json` file in the root folder, [here](https://github.com/leevilaukka/alkometriikka/blob/gh-pages/data.json).

The "official" page manages this by using a GitHub Actions workflow to build the app, download and parse the price list to the root of the built site, and then deploy it on GitHub Pages.
