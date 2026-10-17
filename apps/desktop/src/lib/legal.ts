export const LEGAL_COPY = {
  about: {
    paragraphs: [
      "ReadAloud is a local-first reading and listening companion for books, reports and long documents. It pairs sentence-synchronised captions with page-style previews and playback controls so readers can follow along and return to their place.",
      "Project owner and rights contact: PerezChris99. Original ReadAloud materials are proprietary and all rights are reserved, except where third-party components carry their own licenses. Written permission is required before using, redistributing, modifying or contributing to the original project.",
      "The app stores its library locally by default. Device-installed voices work without a remote speech service; optional neural speech and some document extraction features require a service configured by the user. ReadAloud does not currently provide accounts, cloud sync, cloud backup or advertising analytics.",
      "ReadAloud is provided by the project owner identified as PerezChris99. The exact registered legal name and jurisdiction of the owner's company have not been supplied in this release record; company-specific ownership claims must be confirmed from signed company records before commercial distribution.",
      "Questions, accessibility feedback and written permission requests: kweeziperez712@gmail.com."
    ]
  },
  privacy: {
    paragraphs: [
      "Privacy Notice — effective 17 October 2026. ReadAloud is designed to keep imported books and reading progress on the device. The app does not require an account, and the client does not implement advertising analytics or cross-device library synchronisation.",
      "Local storage: imported text, sentence indexes, page previews, book metadata and reading positions are stored in local app storage (SQLite on mobile and IndexedDB on desktop). The original file is not modified or deleted by importing it. Removing a book deletes its stored local index, not the original source file.",
      "Remote document processing: mobile PDF/image extraction and OCR require a service URL configured by the user. When that path is used, the selected file is uploaded to that service for processing. Desktop may use its configured service for extraction fallback. Do not configure a service you do not trust.",
      "Neural speech: when enabled, the current sentence and selected voice parameters are sent to the configured ReadAloud API, which forwards the speech request to its configured provider (currently Azure Speech in the provided API implementation). That operator and provider may process request data under their own terms. Review the operator's and provider's privacy/retention terms before use.",
      "Retention and deletion: local indexed content remains until the user removes the book or uninstalls/clears the app's data. The client does not provide a cloud library or cloud backup. The API implementation is designed not to retain uploaded document contents or generated audio as a library; infrastructure logs and third-party provider processing must be configured and reviewed by the service operator. Do not promise zero logging without verifying the deployment.",
      "Security: use only HTTPS remote endpoints and trusted service operators. Never send documents or sentence text to a service without understanding who operates it and what its terms are.",
      "Privacy requests and contact: email kweeziperez712@gmail.com. Include ReadAloud in the subject and do not attach sensitive books unless necessary. The publisher will respond to privacy questions and requests as required by applicable law.",
      "This notice describes the current source design and must be checked against the final deployed API, cloud logs, speech-provider settings, SDK behavior and applicable law before store submission. It is not legal advice."
    ]
  },
  terms: {
    paragraphs: [
      "Terms of Use — effective 17 October 2026. By installing or using ReadAloud, you agree to use it lawfully and in accordance with these terms. If you do not agree, do not use the application.",
      "Your documents and rights: import and process only documents you own or are authorised to access, copy, transform or send to a service. You remain responsible for copyright, confidentiality, data-protection obligations and any restrictions imposed by a document's owner. Local import does not transfer ownership of the original work to ReadAloud.",
      "Proprietary software: original ReadAloud source code, designs and documentation are proprietary to the project rights holder, subject to third-party rights. Public repository access is not a license. Prior explicit written permission is required for use, modification, redistribution, commercial exploitation or contributions. See the Proprietary License page.",
      "Third-party services and costs: optional remote extraction, OCR and neural speech require a configured service and internet access and may incur service/provider charges. You are responsible for reviewing the operator's and provider's terms and any charges associated with the endpoint you configure.",
      "Accuracy and availability: extraction, OCR, system voices and neural speech may omit, mispronounce, misinterpret or fail to process content. Always consult the source document for exact wording. Do not rely on generated speech as the authoritative version of legal, medical, financial, academic or safety-critical information.",
      "Acceptable use: do not use ReadAloud to violate law, infringe rights, bypass access restrictions, attack a service, overload an endpoint or send content you are not entitled to disclose. Service operators may impose additional terms and limits.",
      "Disclaimer and liability: to the maximum extent permitted by applicable law, the app is provided as available without warranties that cannot lawfully be excluded. Nothing in these terms excludes mandatory consumer rights or liability that cannot lawfully be limited. Any additional limitation, governing law and dispute terms must be reviewed for the relevant jurisdiction.",
      "Changes and contact: terms may be updated for future releases. Questions about these terms or written permission requests: kweeziperez712@gmail.com. Effective date: 17 October 2026."
    ]
  },
  license: {
    paragraphs: [
      "Proprietary Software License — all rights reserved. Copyright (c) 2026 PerezChris99. Rights contact: kweeziperez712@gmail.com.",
      "No general license is granted by downloading, viewing, cloning, forking or otherwise accessing this repository or app. Prior explicit written permission from PerezChris99 or a duly authorised rights-holder representative is required to use, copy, modify, adapt, distribute, sublicense, commercially exploit, host or create derivative works from original ReadAloud materials.",
      "Contributions also require prior written approval. Do not submit code, documentation, designs or other copyrightable material until the owner approves the contribution route and applicable terms in writing. The owner may require a separate contributor agreement. Opening a pull request does not itself grant rights to either party.",
      "Third-party dependencies, fonts, native components and services remain governed by their own licenses and terms. This proprietary notice does not override those rights.",
      "The owner may administer or assign rights through a duly designated company. The registered company name, company number and jurisdiction have not been supplied in this release record and are not invented here. A company-specific ownership claim must be supported by actual signed legal records.",
      "Unauthorised use may infringe copyright or other applicable rights and may result in enforcement action as permitted by law. This notice is not legal advice; final company ownership records and commercial terms should be reviewed by qualified counsel.",
      "For a written license request, contact kweeziperez712@gmail.com. A request is not approval; permission exists only when explicit written authorisation is issued."
    ]
  }
} as const;
