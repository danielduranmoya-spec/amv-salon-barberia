# AMV Salón barbería · web

Web de una sola página para AMV Salón barbería (C. San Salvador, 35, Mérida): hero en 3D con la barra de servicios, servicios y precios, reservas online, reseñas, mapa con el paseo del cliente, horario y contacto.

```
amv-salon-barberia/
├── index.html          ← toda la web (HTML + CSS + JS)
├── privacidad.html     ← plantilla de política de privacidad (completa los campos amarillos)
├── img/cliente-lado.*  ← el cliente de perfil, para el paseo del mapa
├── modelos/            ← aquí van peluquero.glb y cliente.glb
└── apps-script/Code.gs ← el «servidor» de reservas (Google Calendar + correo)
```

## 1. Modelos 3D

Los dos personajes ya están incluidos: `modelos/peluquero.glb` (≈ 0,5 MB) y `modelos/cliente.glb` (≈ 0,65 MB). Están modelados por código a partir de las láminas de referencia, en estilo dibujo animado de los años 30 con contorno de tinta, y comprimidos para que carguen rápido en el móvil.

- Tienen articulaciones (cabeza, brazos, antebrazos y piernas): al cambiar de servicio los dos caminan dando pasos, y el peluquero levanta el brazo y marca el ritmo de cada servicio (tijeretazos en el corte, brochazos en la barba y el tinte, frotado en el lavado).
- El tinte recolorea el pelo, la barba, el bigote y las cejas del cliente.
- Para cambiar colores o formas, sigue `modelos/LEEME.txt` (la fuente está en `modelos/fuente/`).
- Si un día pones otros modelos y salen de espaldas o de lado, cambia `giroY` en `CONFIG.modelos` dentro de `index.html` (`Math.PI` = media vuelta).

## 2. Probarla en tu ordenador

No funciona con doble clic (el navegador bloquea la carga de los modelos desde `file://`). En VS Code instala la extensión **Live Server**, clic derecho en `index.html` → **Open with Live Server**.

Truco: en la consola del navegador, `__barberia.preview('tinte', 0.5)` muestra un fotograma concreto de cualquier servicio, y `__barberia.playWalk()` repite el paseo del mapa.

## 3. Reservas reales (Google Calendar + correo)

Sin configurar, las reservas funcionan en **modo demostración**: se guardan solo en el navegador y no se envía correo (la web lo indica).

Para activarlas, con la cuenta de Google del negocio:

1. En Google Calendar crea un calendario «Reservas AMV» (o usa el principal). En su configuración copia el **ID del calendario**.
2. Entra en https://script.google.com → **Nuevo proyecto**, borra el contenido y pega `apps-script/Code.gs`.
3. Arriba del todo, en `AJUSTES`, pon el `CALENDAR_ID` (o deja `'primary'`) y, si quieres un aviso por cada reserva, tu correo en `AVISAR_A`.
4. En **Configuración del proyecto** pon la zona horaria *(GMT+01:00) Madrid*.
5. Ejecuta la función `probar` (botón ▶) y acepta los permisos de Calendar y Gmail.
6. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: *Yo*. Quién tiene acceso: *Cualquier usuario*. Copia la URL que termina en `/exec`.
7. En `index.html`, pega esa URL en `RESERVAS.url`.

Cómo funciona:
- La web pide al script los tramos ocupados del calendario y muestra solo las horas libres de cada día según el horario y la duración del servicio.
- Al confirmar, el script vuelve a comprobar que la hora sigue libre (con bloqueo, para que dos personas no reserven la misma), crea el evento con nombre, teléfono y correo, y envía al cliente un correo de confirmación con su nombre.
- Para cerrar un día (vacaciones, festivos) basta con crear en ese calendario un evento de día completo. Cualquier evento bloquea su franja, salvo los marcados como «Disponible».
- Gmail gratuito permite unos 100 correos al día.

Si cambias horario, servicios o duraciones, cámbialos en los dos sitios: `HORARIO`/`SERVICIOS` de `index.html` y de `Code.gs`. Tras editar `Code.gs`, vuelve a **Implementar → Gestionar implementaciones → Editar → Nueva versión**.

## 4. Qué está sacado del negocio y qué no

- Real: nombre, dirección, coordenadas, teléfono, Instagram, horario y las 7 reseñas de Google (5,0).
- Ficticio: los precios, salvo el **corte de pelo a 12 €**, y las descripciones de los servicios.
- Logotipo: está redibujado en SVG a partir de la foto de perfil (es de 150 px). Cuando tengas el archivo original, sustituye el `<symbol id="amv-logo">` del principio de `index.html`.
- Reseñas: se muestran la nota, el número de reseñas, una frase corta y los temas que más se repiten. Para publicar los textos completos, que lo autorice el negocio y añádelos en `RESENAS`.

## 5. Publicar

Sube la carpeta a Vercel, Netlify o GitHub Pages. Antes:
- Completa `privacidad.html` (titular, NIF, correo, plazo de conservación).
- El mapa usa las teselas públicas de OpenStreetMap, válidas para una web con poco tráfico. Si la web crece, cámbialas por un proveedor con clave gratuita (MapTiler, Stadia) en la línea `L.tileLayer(...)`.
