[relizy](../globals.md) / TemplatesConfig

# Interface: TemplatesConfig

Defined in: [src/types.ts:708](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L708)

## Properties

### commitMessage?

> `optional` **commitMessage**: `string`

Defined in: [src/types.ts:712](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L712)

Commit message template

***

### emptyChangelogContent?

> `optional` **emptyChangelogContent**: `string`

Defined in: [src/types.ts:724](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L724)

Empty changelog content

***

### slackMessage?

> `optional` **slackMessage**: `string`

Defined in: [src/types.ts:734](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L734)

Slack message template (optional - if not provided, uses rich blocks format)
Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}

***

### tagBody?

> `optional` **tagBody**: `string`

Defined in: [src/types.ts:720](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L720)

Not used with "independent" version mode

***

### tagMessage?

> `optional` **tagMessage**: `string`

Defined in: [src/types.ts:716](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L716)

Tag message template

***

### twitterMessage?

> `optional` **twitterMessage**: `string`

Defined in: [src/types.ts:729](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L729)

Twitter message template
Available variables: {{projectName}}, {{version}}, {{changelog}}, {{releaseUrl}}, {{changelogUrl}}
