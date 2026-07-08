# rodrigomartins.org

Site academico de Rodrigo Martins.

## Estrutura atual

- `pt/index.html`: nova pagina inicial em portugues.
- `css/modern.css`: estilos da nova versao.
- `pt/publication/`, `pt/post/`, `eng/` e demais pastas: conteudo legado preservado como referencia e para manter URLs antigas funcionando.
- `CNAME`: dominio customizado usado pelo GitHub Pages.

## Rodar localmente

Na raiz do projeto:

```powershell
py -m http.server 8080 --bind 127.0.0.1
```

Depois acesse:

```text
http://127.0.0.1:8080/pt/
```

## Publicacao

O dominio `rodrigomartins.org` esta configurado para GitHub Pages. O GoDaddy deve ser mantido como registrador/DNS, enquanto o conteudo pode continuar sendo publicado pelo GitHub Pages.
