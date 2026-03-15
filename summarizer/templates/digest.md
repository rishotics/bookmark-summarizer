*Daily Bookmark Digest — {{ date }}*
{{ total_new }} new bookmarks, {{ total_important }} worth reading.
{% for group in groups %}

*{{ group.theme }}*
{% for b in group.bookmarks %}
• {{ b.author }}: {{ b.summary }} [link]({{ b.url }})
{% endfor %}
{% endfor %}