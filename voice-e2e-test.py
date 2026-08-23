"""Voice E2E test with fake microphone (Chrome flag) + audio injection via CDP."""
import asyncio
import subprocess
import json

async def main():
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome",
            args=[
                "--use-fake-device-for-media-stream",
                "--use-fake-ui-for-media-stream",
                "--autoplay-policy=no-user-gesture-required",
            ],
            headless=True,
        )
        page = await browser.new_page()
        
        # Collect console + errors
        console_msgs = []
        page.on("console", lambda m: console_msgs.append(f"[{m.type}] {m.text[:150]}"))
        page.on("pageerror", lambda e: console_msgs.append(f"[PAGEERROR] {str(e)[:150]}"))

        await page.goto("http://localhost:3000", wait_until="networkidle")
        
        # Switch to Live Voice
        await page.evaluate("(() => { [...document.querySelectorAll('button')].find(b => b.textContent.includes('Live Voice'))?.click(); })()")
        await page.wait_for_timeout(2000)

        # Tap the orb — with fake media stream, getUserMedia should SUCCEED
        orb = page.locator('button[aria-label*="Voice orb"]')
        await orb.click()
        await page.wait_for_timeout(2000)

        state = await page.evaluate("(() => document.body.innerText.match(/Listening|Tap to talk|Transcribing|Thinking|Speaking|Microphone/) || ['unknown'])[0]")
        print(f"STATE AFTER TAP: {state}")

        # If listening, wait to see if VAD detects the fake audio (fake device plays a tone)
        if state == "Listening":
            await page.wait_for_timeout(6000)
            state2 = await page.evaluate("(() => document.body.innerText.match(/Listening|Transcribing|Thinking|Speaking|didn/i) || ['?'])[0]")
            print(f"STATE AFTER 6s: {state2}")

        # Print voice-related console messages
        voice_logs = [m for m in console_msgs if 'voice' in m.lower() or 'audio' in m.lower() or 'mic' in m.lower()]
        print(f"CONSOLE ({len(console_msgs)} total, {len(voice_logs)} voice):")
        for m in console_msgs[:12]:
            print("  ", m)

        await browser.close()

asyncio.run(main())
