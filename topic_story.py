"""Topic Story: research a plain-text topic into explainer narration beats.

Zero-key default: DuckDuckGo HTML search. Optional SERPAPI/Bing providers
are used automatically when their environment variables are configured.
This module feeds the existing explainer pipeline and returns source
citations alongside the narration beats.
"""
import os
import re
from urllib.parse import urlparse, unquote, parse_qs

import requests
from bs4 import BeautifulSoup

from evidence_link_story import fetch_story


BLOCKED_DOMAINS = {
    "pinterest.com", "quora.com", "facebook.com", "instagram.com",
    "tiktok.com", "twitter.com", "x.com", "reddit.com",
}


def _search_duckduckgo(topic, max_results=6, timeout=12):
    response = requests.get(
        "https://duckduckgo.com/html/",
        params={"q": topic},
        headers={"User-Agent": "Mozilla/5.0 (CartoonStudioTopicStory/1.0)"},
        timeout=timeout,
    )
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    results = []
    for anchor in soup.select("a.result__a"):
        href = anchor.get("href") or ""
        parsed = urlparse(href)
        if parsed.netloc.endswith("duckduckgo.com"):
            href = unquote(parse_qs(parsed.query).get("uddg", [href])[0])
        if href.startswith("http") and href not in results:
            results.append(href)
        if len(results) >= max_results:
            break
    return results


def _search_serpapi(topic, max_results=6, timeout=12):
    key = os.environ.get("SERPAPI_KEY")
    if not key:
        return []
    response = requests.get(
        "https://serpapi.com/search",
        params={"q": topic, "engine": "google", "api_key": key, "num": max_results},
        timeout=timeout,
    )
    response.raise_for_status()
    return [
        item["link"]
        for item in response.json().get("organic_results", [])[:max_results]
        if item.get("link")
    ]


def _search_bing(topic, max_results=6, timeout=12):
    key = os.environ.get("BING_SEARCH_KEY")
    if not key:
        return []
    response = requests.get(
        "https://api.bing.microsoft.com/v7.0/search",
        params={"q": topic, "count": max_results},
        headers={"Ocp-Apim-Subscription-Key": key},
        timeout=timeout,
    )
    response.raise_for_status()
    return [
        item["url"]
        for item in response.json().get("webPages", {}).get("value", [])[:max_results]
    ]


def search_topic(topic, max_results=6):
    for provider in (
        lambda: _search_serpapi(topic, max_results),
        lambda: _search_bing(topic, max_results),
        lambda: _search_duckduckgo(topic, max_results),
    ):
        try:
            results = provider()
            if results:
                return results
        except requests.RequestException:
            continue
    return []


def _domain(url):
    return urlparse(url).netloc.lower().removeprefix("www.")


def gather_sources(topic, max_sources=4, max_candidates=8):
    candidates = search_topic(topic, max_candidates)
    sources = []
    seen_domains = set()

    for url in candidates:
        domain = _domain(url)
        if not domain or domain in BLOCKED_DOMAINS or domain in seen_domains:
            continue
        try:
            story = fetch_story(url)
        except Exception:
            continue
        if len(story.get("text", "")) < 200:
            continue
        story["domain"] = domain
        sources.append(story)
        seen_domains.add(domain)
        if len(sources) >= max_sources:
            break

    if not sources:
        raise RuntimeError(
            f"Couldn't find usable sources for '{topic}'. Try a more specific topic."
        )
    return sources


def _sentences(text):
    return [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", text)
        if len(sentence.strip()) >= 40
    ]


def _similar(a, b, threshold=0.6):
    words_a = set(a.lower().split())
    words_b = set(b.lower().split())
    if not words_a or not words_b:
        return False
    return len(words_a & words_b) / min(len(words_a), len(words_b)) >= threshold


def synthesize_beats(topic, sources, count=8):
    beats = [f"Let's talk about {topic}."]
    used = []
    pools = [_sentences(source["text"]) for source in sources]

    while len(beats) < count and any(pools):
        progressed = False
        for pool in pools:
            if not pool:
                continue
            candidate = pool.pop(0)
            if any(_similar(candidate, previous) for previous in used):
                continue
            beats.append(candidate)
            used.append(candidate)
            progressed = True
            if len(beats) >= count:
                break
        if not progressed:
            break

    while len(beats) < count:
        beats.append("There's more to this story than meets the eye.")

    return beats[:count]


def synthesize_beats_llm(topic, sources, count=8, client=None, model="claude-sonnet-4-6"):
    if client is None:
        return synthesize_beats(topic, sources, count)

    source_text = "\n\n".join(
        f"SOURCE ({source['domain']}): {source['text'][:2000]}"
        for source in sources
    )
    prompt = (
        f"Write a {count}-beat narration script for a short explainer video "
        f"about '{topic}', using only facts from the sources below. "
        "Each beat must be one short punchy sentence (max ~18 words), "
        "suitable for narration and kinetic captions. Return one beat per line, no numbering.\n\n"
        f"{source_text}"
    )
    response = client.messages.create(
        model=model,
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(
        block.text for block in response.content
        if getattr(block, "type", "") == "text"
    )
    lines = [line.strip("-• ").strip() for line in text.splitlines() if line.strip()]
    return (lines or synthesize_beats(topic, sources, count))[:count]


def build_topic_story(topic, max_sources=4, beat_count=8, llm_client=None):
    topic = str(topic or "").strip()
    if not topic:
        raise ValueError("A topic is required.")

    sources = gather_sources(topic, max_sources=max_sources)
    beats = synthesize_beats_llm(
        topic, sources, count=beat_count, client=llm_client
    ) if llm_client else synthesize_beats(topic, sources, count=beat_count)

    return {
        "topic": topic,
        "beats": beats,
        "sources": [
            {
                "url": source["url"],
                "title": source["title"],
                "domain": source["domain"],
            }
            for source in sources
        ],
    }
