var owl = $('.owl-carousel');
owl.owlCarousel({
    items: 6,
    loop: true,
    margin: 10,
    dots:true,
    autoplay: true,
    slideTransition: 'linear',
    autoplayTimeout: 1000,
    autoplaySpeed: 1000,
    autoplayHoverPause: true,
    responsive: {
        0: {
            items: 3
        },
        600: {
            items: 6
        },
        1000: {
            items: 10
        }
    }
});
