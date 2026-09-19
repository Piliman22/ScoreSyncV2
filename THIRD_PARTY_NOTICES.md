# Third-party components

- Honolus: https://github.com/Untitled-Sekai/Honolus (ISC).
- Project Sekai extended engine: https://github.com/Untitled-Sekai/sonolus-pjsekai-engine-extended (MIT), commit `80e5c0297cd88f566dec287ef8397e7d9b96c5db`. Converter source and license are in `vendor/pjsekai`. Engine assets use the same revision.
- Sonolus Free Pack: https://github.com/Sonolus/sonolus-free-pack (MIT), installed as `@sonolus/free-pack`.
- Other dependencies retain their licenses in their npm distributions.

`assets/FreePack.scp` combines Free Pack assets with the extended engine built from the public fork. It is built during development, never downloaded or expanded at application startup.
