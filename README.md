# Keep Supply Prospector

AI-powered industrial refrigeration prospecting for the Western U.S.

## Qualification rules

- Industrial refrigeration is the primary prospecting target.
- Ammonia is a technology signal, not a requirement.
- The 10,000 lb threshold applies **only when ammonia is present** and evidence supports evaluating system charge.
- Non-ammonia refrigeration prospects can still receive a high score.

## Research sources planned

Public web search, company/facility websites, EPA RMP and Envirofacts data, OSHA/public safety records, state environmental sources, public PDFs/news/expansion records, and optional map/place data.

## Deployment

Hosted web application on Vercel. End users should only need a browser.

## Live research

The hosted research route expects the `OPENAI_API_KEY` environment variable in Vercel. Environment variables are server-side and are never exposed to the browser.
